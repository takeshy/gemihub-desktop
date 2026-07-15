// Query engine — enumerate, filter, sort, limit, group, summary (§4.2, §16, §18).

import type {
  AstNode,
  BaseEntry,
  BaseEntryGroup,
  BasesHostAdapter,
  CompiledBase,
  DateValue,
  Diagnostic,
  ErrorValue,
  EvalContext,
  FilterNode,
  HostFile,
  NumberValue,
  ObjectValue,
  QueryResult,
  QuerySnapshot,
  RowScope,
  Value,
  ViewConfig,
} from "./types";
import { dateVal, durVal, errorVal, listVal, NULL, num, str } from "./types";
import { ParseError, parseExpression } from "./parser";
import { LexError } from "./lexer";
import { evaluate } from "./evaluator";
import {
  compareValues,
  isEmpty,
  isTruthy,
  looseEquals,
  rawToValue,
  valueToString,
} from "./values";
import { hostFileToFileValue } from "./functions";
import { createFormulaNamespace } from "./formula";

// ---------------------------------------------------------------------------
// Query a view
// ---------------------------------------------------------------------------

export function queryView(
  base: CompiledBase,
  viewName: string,
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
): QueryResult {
  const diagnostics: Diagnostic[] = [...base.diagnostics];

  // Find the view
  const view = base.config.views.find((v) => v.name === viewName);
  if (!view) {
    diagnostics.push({
      code: "CFG002",
      severity: "error",
      message: `View not found: ${viewName}`,
    });
    return {
      data: [],
      groupedData: [],
      properties: [],
      diagnostics,
      getSummaryValue: () => NULL,
    };
  }

  // Compile filters
  const globalFilterAst = compileFilter(
    base.config.filters,
    "filters",
    diagnostics,
  );
  const viewFilterAst = compileFilter(
    view.filters,
    `views[${viewName}]`,
    diagnostics,
  );

  // Compile view sort (already validated as property IDs)
  const sortKeys = view.sort ?? [];

  // Enumerate files and create row contexts
  const files = host.enumerateFiles().sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );
  let entries: BaseEntry[] = files.map((hf) =>
    createEntry(hf, host, snapshot, base)
  );

  // Apply filters
  entries = entries.filter((entry) => {
    const ctx = makeEvalContext(snapshot, host, entry, diagnostics);
    return evalFilter(globalFilterAst, entry, ctx, diagnostics) &&
      evalFilter(viewFilterAst, entry, ctx, diagnostics);
  });

  // Apply sort (stable)
  if (sortKeys.length > 0) {
    entries = stableSort(entries, sortKeys, host, snapshot, diagnostics);
  }

  // Apply limit
  if (view.limit && view.limit > 0) {
    entries = entries.slice(0, view.limit);
  }

  // Group by
  let groupedData: BaseEntryGroup[] = [];
  if (view.groupBy) {
    groupedData = groupEntries(
      entries,
      view.groupBy.property,
      view.groupBy.direction,
      host,
      snapshot,
      diagnostics,
    );
    // Apply summaries to each group
    if (view.summaries) {
      for (const group of groupedData) {
        for (const [propId, summaryName] of Object.entries(view.summaries)) {
          const values = group.entries.map((e) =>
            resolveProperty(e, propId, host, snapshot, diagnostics)
          );
          group.summaries.set(
            propId,
            computeSummary(
              summaryName,
              values,
              base,
              host,
              snapshot,
              diagnostics,
            ),
          );
        }
      }
    }
  }

  // Collect properties (from order or all keys)
  const properties = collectProperties(base, view, entries);

  // getSummaryValue function
  const getSummaryValue = (
    entries: BaseEntry[],
    property: string,
    summary: string,
  ): Value => {
    const values = entries.map((e) =>
      resolveProperty(e, property, host, snapshot, diagnostics)
    );
    return computeSummary(summary, values, base, host, snapshot, diagnostics);
  };

  return {
    data: entries,
    groupedData,
    properties,
    diagnostics,
    getSummaryValue,
  };
}

// ---------------------------------------------------------------------------
// Create a BaseEntry from a HostFile
// ---------------------------------------------------------------------------

function createEntry(
  hf: HostFile,
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
  base: CompiledBase,
): BaseEntry {
  const file = hostFileToFileValue(hf);
  const fm = host.getFrontmatter(hf);
  const propTypes = host.getPropertyTypes(hf);

  // Convert frontmatter to ObjectValue
  const entries: [string, Value][] = [];
  if (fm) {
    for (const [k, v] of Object.entries(fm)) {
      entries.push([k, rawToValue(v, propTypes, k, hf, host)]);
    }
  }
  const note: ObjectValue = { type: "object", map: new Map(entries) };

  // Display context
  const displayCtx = host.getDisplayContext();
  const thisValue: Value = displayCtx ? hostFileToFileValue(displayCtx) : NULL;

  const formulaCache = new Map<string, Value>();
  const rowScope: RowScope = {
    note,
    file,
    fileMeta: hf,
    formula: { names: [], resolve: () => undefined }, // placeholder, set below
    this: thisValue,
  };

  const entry: BaseEntry = { file, rowScope, formulaCache };

  // Create formula namespace with the proper context
  const ctx: EvalContext = {
    snapshot,
    host,
    rowScope,
    diagnostics: [],
    formulaCache,
    evaluatingFormulas: new Set(),
  };
  rowScope.formula = createFormulaNamespace(base.formulas, ctx, rowScope);

  return entry;
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

function makeEvalContext(
  snapshot: QuerySnapshot,
  host: BasesHostAdapter,
  entry: BaseEntry,
  diagnostics: Diagnostic[],
): EvalContext {
  return {
    snapshot,
    host,
    rowScope: entry.rowScope,
    diagnostics,
    formulaCache: entry.formulaCache,
    evaluatingFormulas: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Filter compilation and evaluation (§16)
// ---------------------------------------------------------------------------

type CompiledFilter = {
  ast: AstNode | null;
  children: CompiledFilter[] | null;
  type: "expr" | "and" | "or" | "not";
};

function compileFilter(
  node: FilterNode | undefined,
  section: string,
  diagnostics: Diagnostic[],
): CompiledFilter {
  if (node === undefined) return { ast: null, children: null, type: "expr" };
  if (typeof node === "string") {
    try {
      const ast = parseExpression(node);
      return { ast, children: null, type: "expr" };
    } catch (e) {
      const code = e instanceof LexError
        ? e.code
        : e instanceof ParseError
        ? e.code
        : "EVAL002";
      diagnostics.push({
        code,
        severity: "error",
        message: `Filter parse error in '${section}': ${(e as Error).message}`,
      });
      return { ast: null, children: null, type: "expr" };
    }
  }
  if (typeof node === "object" && node !== null) {
    const obj = node as {
      and?: FilterNode[];
      or?: FilterNode[];
      not?: FilterNode[];
    };
    if (obj.and) {
      return {
        ast: null,
        children: obj.and.map((c) => compileFilter(c, section, diagnostics)),
        type: "and",
      };
    }
    if (obj.or) {
      return {
        ast: null,
        children: obj.or.map((c) => compileFilter(c, section, diagnostics)),
        type: "or",
      };
    }
    if (obj.not) {
      return {
        ast: null,
        children: obj.not.map((c) => compileFilter(c, section, diagnostics)),
        type: "not",
      };
    }
  }
  return { ast: null, children: null, type: "expr" };
}

function evalFilter(
  filter: CompiledFilter,
  entry: BaseEntry,
  ctx: EvalContext,
  diagnostics: Diagnostic[],
): boolean {
  if (filter.type === "expr") {
    if (!filter.ast) return true; // No filter = pass
    const result = evaluate(filter.ast, ctx);
    if (result.type === "error") {
      diagnostics.push({
        code: result.code,
        severity: "error",
        message: result.message,
      });
      return false;
    }
    try {
      return isTruthy(result);
    } catch (e) {
      const err = e as ErrorValue;
      diagnostics.push({
        code: err.code,
        severity: "error",
        message: err.message,
      });
      return false;
    }
  }

  if (!filter.children) return true;

  if (filter.type === "and") {
    for (const child of filter.children) {
      if (!evalFilter(child, entry, ctx, diagnostics)) return false;
    }
    return true;
  }

  if (filter.type === "or") {
    for (const child of filter.children) {
      if (evalFilter(child, entry, ctx, diagnostics)) return true;
    }
    return false;
  }

  if (filter.type === "not") {
    for (const child of filter.children) {
      if (evalFilter(child, entry, ctx, diagnostics)) return false;
    }
    return true;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Sort (§11.3, stable)
// ---------------------------------------------------------------------------

function stableSort(
  entries: BaseEntry[],
  sortKeys: Array<{ property: string; direction: "ASC" | "DESC" }>,
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
  diagnostics: Diagnostic[],
): BaseEntry[] {
  const indexed = entries.map((e, i) => ({ entry: e, baseline: i }));
  indexed.sort((a, b) => {
    for (const key of sortKeys) {
      const va = resolveProperty(
        a.entry,
        key.property,
        host,
        snapshot,
        diagnostics,
      );
      const vb = resolveProperty(
        b.entry,
        key.property,
        host,
        snapshot,
        diagnostics,
      );
      let cmp = compareValues(va, vb);
      if (key.direction === "DESC") cmp = -cmp;
      if (cmp !== 0) return cmp;
    }
    return a.baseline - b.baseline; // Stable
  });
  return indexed.map((x) => x.entry);
}

// ---------------------------------------------------------------------------
// Group by
// ---------------------------------------------------------------------------

function groupEntries(
  entries: BaseEntry[],
  property: string,
  direction: "ASC" | "DESC",
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
  diagnostics: Diagnostic[],
): BaseEntryGroup[] {
  const groups = new Map<string, { key: Value; entries: BaseEntry[] }>();

  for (const entry of entries) {
    const key = resolveProperty(entry, property, host, snapshot, diagnostics);
    const keyStr = key.type === "string" || key.type === "number" ||
        key.type === "boolean" || key.type === "null"
      ? valueToString(key)
      : JSON.stringify(key);
    const existing = groups.get(keyStr);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(keyStr, { key, entries: [entry] });
    }
  }

  const result = [...groups.values()].sort((a, b) => {
    const cmp = compareValues(a.key, b.key);
    return direction === "DESC" ? -cmp : cmp;
  });

  return result.map((g) => ({
    key: g.key,
    entries: g.entries,
    summaries: new Map(),
  }));
}

// ---------------------------------------------------------------------------
// Property resolution
// ---------------------------------------------------------------------------

export function resolveProperty(
  entry: BaseEntry,
  propertyId: string,
  host: BasesHostAdapter,
  _snapshot: QuerySnapshot,
  _diagnostics: Diagnostic[],
): Value {
  const dotIdx = propertyId.indexOf(".");
  if (dotIdx < 0) {
    // Bare property → note property
    return entry.rowScope.note.map.get(propertyId) ?? NULL;
  }

  const prefix = propertyId.substring(0, dotIdx);
  const name = propertyId.substring(dotIdx + 1);

  if (prefix === "note") {
    return entry.rowScope.note.map.get(name) ?? NULL;
  }
  if (prefix === "file") {
    return resolveFileField(name, entry, host);
  }
  if (prefix === "formula") {
    return entry.rowScope.formula.resolve(name) ?? NULL;
  }

  return NULL;
}

function resolveFileField(
  field: string,
  entry: BaseEntry,
  host: BasesHostAdapter,
): Value {
  const file = entry.rowScope.file;
  switch (field) {
    case "name":
      return str(file.name);
    case "basename":
      return str(file.basename);
    case "path":
      return str(file.path);
    case "folder":
      return str(file.folder);
    case "ext":
      return str(file.ext);
    case "size":
      return num(file.size);
    case "ctime":
      return dateVal(file.ctimeMs, false);
    case "mtime":
      return dateVal(file.mtimeMs, false);
    case "file":
      return file;
    case "properties":
      return entry.rowScope.note;
    case "tags":
      return listVal(host.getTags(entry.rowScope.fileMeta).map((t) => str(t)));
    case "links":
      return listVal(
        host.getOutgoingLinks(entry.rowScope.fileMeta).map((l) => ({
          type: "link" as const,
          target: l.target,
          sourcePath: file.path,
          resolvedPath: l.resolvedPath,
        })),
      );
    case "backlinks":
      return listVal(
        host.getBacklinks(entry.rowScope.fileMeta).map((bf) => ({
          type: "file" as const,
          path: bf.path,
          name: bf.name,
          basename: bf.basename,
          ext: bf.extension,
          folder: bf.path.includes("/")
            ? bf.path.substring(0, bf.path.lastIndexOf("/"))
            : "",
          size: bf.size,
          ctimeMs: bf.ctimeMs,
          mtimeMs: bf.mtimeMs,
        })),
      );
    case "embeds":
      return listVal(
        host.getEmbeds(entry.rowScope.fileMeta).map((l) => ({
          type: "link" as const,
          target: l.target,
          sourcePath: file.path,
          resolvedPath: l.resolvedPath,
        })),
      );
    default:
      return NULL;
  }
}

// ---------------------------------------------------------------------------
// Summaries (§18)
// ---------------------------------------------------------------------------

const BUILTIN_SUMMARY_NAMES = new Set([
  "Average",
  "Min",
  "Max",
  "Sum",
  "Range",
  "Median",
  "Stddev",
  "Earliest",
  "Latest",
  "Checked",
  "Unchecked",
  "Empty",
  "Filled",
  "Unique",
]);

function computeSummary(
  summaryName: string,
  values: Value[],
  base: CompiledBase,
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
  diagnostics: Diagnostic[],
): Value {
  // Custom summary
  if (!BUILTIN_SUMMARY_NAMES.has(summaryName)) {
    const compiled = base.customSummaries.get(summaryName);
    if (!compiled) {
      return errorVal("SUMMARY001", `Unknown summary: ${summaryName}`);
    }
    const ctx: EvalContext = {
      snapshot,
      host,
      diagnostics,
      summaryValues: listVal(values),
    };
    return evaluate(compiled.ast, ctx);
  }

  // Built-in summaries
  switch (summaryName) {
    case "Average":
      return summaryAverage(values);
    case "Min":
      return summaryMin(values);
    case "Max":
      return summaryMax(values);
    case "Sum":
      return summarySum(values);
    case "Range":
      return summaryRange(values);
    case "Median":
      return summaryMedian(values);
    case "Stddev":
      return summaryStddev(values);
    case "Earliest":
      return summaryEarliest(values);
    case "Latest":
      return summaryLatest(values);
    case "Checked":
      return summaryChecked(values);
    case "Unchecked":
      return summaryUnchecked(values);
    case "Empty":
      return summaryEmpty(values);
    case "Filled":
      return summaryFilled(values);
    case "Unique":
      return summaryUnique(values);
    default:
      return errorVal("SUMMARY001", `Unknown summary: ${summaryName}`);
  }
}

function summaryAverage(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  if (nums.length === 0) return NULL;
  return num(nums.reduce((acc, n) => acc + n.value, 0) / nums.length);
}

function summaryMin(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  if (nums.length === 0) return NULL;
  return num(Math.min(...nums.map((n) => n.value)));
}

function summaryMax(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  if (nums.length === 0) return NULL;
  return num(Math.max(...nums.map((n) => n.value)));
}

function summarySum(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  if (nums.length === 0) return num(0);
  return num(nums.reduce((acc, n) => acc + n.value, 0));
}

function summaryRange(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  const dates = values.filter((v) => v.type === "date") as DateValue[];
  if (nums.length > 0 && dates.length > 0) {
    return errorVal(
      "SUMMARY002",
      "Range has ambiguous input type: number and date",
    );
  }
  if (nums.length > 0) {
    const min = Math.min(...nums.map((n) => n.value));
    const max = Math.max(...nums.map((n) => n.value));
    return num(max - min);
  }
  if (dates.length > 0) {
    const min = Math.min(...dates.map((d) => d.epochMs));
    const max = Math.max(...dates.map((d) => d.epochMs));
    return durVal(0, max - min);
  }
  return NULL;
}

function summaryMedian(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  if (nums.length === 0) return NULL;
  const sorted = nums.map((n) => n.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return num((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return num(sorted[mid]);
}

function summaryStddev(values: Value[]): Value {
  const nums = values.filter((v) => v.type === "number") as NumberValue[];
  if (nums.length === 0) return NULL;
  const arr = nums.map((n) => n.value);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length; // population stddev
  return num(Math.sqrt(variance));
}

function summaryEarliest(values: Value[]): Value {
  const dates = values.filter((v) => v.type === "date") as DateValue[];
  if (dates.length === 0) return NULL;
  const min = Math.min(...dates.map((d) => d.epochMs));
  const orig = dates.find((d) => d.epochMs === min);
  return dateVal(min, orig?.dateOnly ?? false);
}

function summaryLatest(values: Value[]): Value {
  const dates = values.filter((v) => v.type === "date") as DateValue[];
  if (dates.length === 0) return NULL;
  const max = Math.max(...dates.map((d) => d.epochMs));
  const orig = dates.find((d) => d.epochMs === max);
  return dateVal(max, orig?.dateOnly ?? false);
}

function summaryChecked(values: Value[]): Value {
  const count = values.filter((v) => v.type === "boolean" && v.value).length;
  return num(count);
}

function summaryUnchecked(values: Value[]): Value {
  const count = values.filter((v) => v.type === "boolean" && !v.value).length;
  return num(count);
}

function summaryEmpty(values: Value[]): Value {
  let count = 0;
  for (const v of values) {
    if (v.type === "error") continue;
    try {
      if (isEmpty(v)) count++;
    } catch {
      // Error value — skip
    }
  }
  return num(count);
}

function summaryFilled(values: Value[]): Value {
  let count = 0;
  for (const v of values) {
    if (v.type === "error") continue;
    try {
      if (!isEmpty(v)) count++;
    } catch {
      // Error value — skip
    }
  }
  return num(count);
}

function summaryUnique(values: Value[]): Value {
  const seen: Value[] = [];
  for (const v of values) {
    if (v.type === "error") continue;
    let found = false;
    for (const s of seen) {
      const eq = looseEquals(v, s);
      if (eq === true) {
        found = true;
        break;
      }
    }
    if (!found) seen.push(v);
  }
  return num(seen.length);
}

// ---------------------------------------------------------------------------
// Collect properties for display
// ---------------------------------------------------------------------------

function collectProperties(
  base: CompiledBase,
  view: ViewConfig,
  entries: BaseEntry[],
): string[] {
  if (view.order && view.order.length > 0) {
    return view.order;
  }

  // Derive from formulas + first entry's note properties + file builtins
  const props = new Set<string>();
  for (const name of base.formulas.keys()) {
    props.add(`formula.${name}`);
  }
  props.add("file.name");
  if (entries.length > 0) {
    for (const key of entries[0].rowScope.note.map.keys()) {
      props.add(`note.${key}`);
    }
  }
  return [...props];
}
