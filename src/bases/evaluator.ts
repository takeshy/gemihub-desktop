// AST evaluator — interprets expression ASTs in an evaluation context (§9, §12).

import type {
  AstNode,
  DateValue,
  ErrorValue,
  EvalContext,
  FileValue,
  ListValue,
  NumberValue,
  Value,
} from "./types";
import {
  bool,
  dateVal,
  errorVal,
  FALSE,
  listVal,
  NULL,
  num,
  str,
  TRUE,
} from "./types";
import {
  addDurations,
  addDurationToDate,
  dateMinusDate,
  divideDuration,
  getTimezoneOffsetMs,
  isEmpty,
  isTruthy,
  looseEquals,
  multiplyDuration,
  parseDate,
  parseDuration,
  subtractDurationFromDate,
  subtractDurations,
  valueToString,
} from "./values";
import { commonMethods, globalFunctions, typeMethods } from "./functions";

export function evaluate(ast: AstNode, ctx: EvalContext): Value {
  try {
    return evalNode(ast, ctx);
  } catch (e) {
    if (isErrorValue(e)) return e;
    return errorVal("EVAL002", `Internal error: ${(e as Error).message}`);
  }
}

function isErrorValue(v: unknown): v is ErrorValue {
  return typeof v === "object" && v !== null &&
    (v as ErrorValue).type === "error";
}

function evalNode(node: AstNode, ctx: EvalContext): Value {
  switch (node.kind) {
    case "literal":
      return node.value;

    case "identifier":
      return resolveIdentifier(node.name, ctx);

    case "list":
      return listVal(node.elements.map((e) => evaluate(e, ctx)));

    case "unary":
      return evalUnary(node, ctx);

    case "binary":
      return evalBinary(node, ctx);

    case "member":
      return evalMember(node, ctx);

    case "index":
      return evalIndex(node, ctx);

    case "call":
      return evalCall(node, ctx);

    default:
      return errorVal(
        "EVAL002",
        `Unknown AST node kind: ${(node as { kind: string }).kind}`,
      );
  }
}

// ---------------------------------------------------------------------------
// Identifier resolution (§9.2)
// ---------------------------------------------------------------------------

function resolveIdentifier(name: string, ctx: EvalContext): Value {
  // 1. List callback locals
  if (ctx.locals) {
    const local = ctx.locals.get(name);
    if (local !== undefined) return local;
  }

  // 2. Summary locals
  if (ctx.summaryValues && name === "values") {
    return ctx.summaryValues;
  }

  // 3. Reserved namespaces
  if (
    name === "note" || name === "file" || name === "formula" || name === "this"
  ) {
    if (!ctx.rowScope) return NULL;
    if (name === "this") return ctx.rowScope.this;
    if (name === "note") return ctx.rowScope.note;
    if (name === "file") return ctx.rowScope.file;
    if (name === "formula") return getFormulaNamespaceValue(ctx);
    return NULL;
  }

  // 4. Bare note property — takes precedence over a global function name used
  //    as a bare value, so a frontmatter property like `image` resolves even
  //    though there is also an image() function (e.g. formula `image(image)`).
  if (ctx.rowScope) {
    const prop = ctx.rowScope.note.map.get(name);
    if (prop !== undefined) return prop;
    // Try case-fold (§26 hasProperty, but for bare access we do exact match)
  }

  // 5. Global function name (when used as identifier, not call) — return null
  if (globalFunctions[name]) return NULL;

  // 6. Unresolved → Null
  return NULL;
}

function getFormulaNamespaceValue(ctx: EvalContext): Value {
  // Return an object value with formula names as keys
  if (!ctx.rowScope) return NULL;
  const entries: [string, Value][] = [];
  for (const name of ctx.rowScope.formula.names) {
    entries.push([name, NULL]); // placeholder; actual access via member
  }
  return { type: "object", map: new Map(entries) };
}

// ---------------------------------------------------------------------------
// Unary (§12.1)
// ---------------------------------------------------------------------------

function evalUnary(node: AstNode & { kind: "unary" }, ctx: EvalContext): Value {
  const operand = evaluate(node.operand, ctx);
  if (operand.type === "error") return operand;

  switch (node.op) {
    case "!":
      try {
        return bool(!isTruthy(operand));
      } catch (e) {
        return e as ErrorValue;
      }
    case "+":
      if (operand.type !== "number") {
        return errorVal("TYPE001", "Unary + requires a number");
      }
      return operand;
    case "-":
      if (operand.type !== "number") {
        return errorVal("TYPE001", "Unary - requires a number");
      }
      return num(-operand.value);
    default:
      return errorVal("EVAL002", `Unknown unary operator: ${node.op}`);
  }
}

// ---------------------------------------------------------------------------
// Binary (§12)
// ---------------------------------------------------------------------------

function evalBinary(
  node: AstNode & { kind: "binary" },
  ctx: EvalContext,
): Value {
  const op = node.op;

  // Short-circuit && and ||
  if (op === "&&") {
    const left = evaluate(node.left, ctx);
    if (left.type === "error") return left;
    try {
      if (!isTruthy(left)) return FALSE;
    } catch (e) {
      return e as ErrorValue;
    }
    const right = evaluate(node.right, ctx);
    if (right.type === "error") return right;
    try {
      return bool(isTruthy(right));
    } catch (e) {
      return e as ErrorValue;
    }
  }

  if (op === "||") {
    const left = evaluate(node.left, ctx);
    if (left.type === "error") return left;
    try {
      if (isTruthy(left)) return TRUE;
    } catch (e) {
      return e as ErrorValue;
    }
    const right = evaluate(node.right, ctx);
    if (right.type === "error") return right;
    try {
      return bool(isTruthy(right));
    } catch (e) {
      return e as ErrorValue;
    }
  }

  // Eager evaluation for other operators
  const left = evaluate(node.left, ctx);
  if (left.type === "error") return left;
  const right = evaluate(node.right, ctx);
  if (right.type === "error") return right;

  switch (op) {
    case "==": {
      const eq = looseEquals(left, right);
      if (typeof eq !== "boolean") return eq;
      return bool(eq);
    }
    case "!=": {
      const eq = looseEquals(left, right);
      if (typeof eq !== "boolean") return eq;
      return bool(!eq);
    }
    case ">":
      return evalRelational(left, right, ">");
    case "<":
      return evalRelational(left, right, "<");
    case ">=":
      return evalRelational(left, right, ">=");
    case "<=":
      return evalRelational(left, right, "<=");
    case "+":
      return evalAdd(left, right, ctx);
    case "-":
      return evalSub(left, right, ctx);
    case "*":
      return evalMul(left, right, ctx);
    case "/":
      return evalDiv(left, right, ctx);
    case "%":
      return evalMod(left, right);
    default:
      return errorVal("EVAL002", `Unknown binary operator: ${op}`);
  }
}

function evalRelational(left: Value, right: Value, op: string): Value {
  // Number vs Number
  if (left.type === "number" && right.type === "number") {
    if (Number.isNaN(left.value) || Number.isNaN(right.value)) return FALSE;
    switch (op) {
      case ">":
        return bool(left.value > right.value);
      case "<":
        return bool(left.value < right.value);
      case ">=":
        return bool(left.value >= right.value);
      case "<=":
        return bool(left.value <= right.value);
    }
  }

  // Date vs Date
  if (left.type === "date" && right.type === "date") {
    switch (op) {
      case ">":
        return bool(left.epochMs > right.epochMs);
      case "<":
        return bool(left.epochMs < right.epochMs);
      case ">=":
        return bool(left.epochMs >= right.epochMs);
      case "<=":
        return bool(left.epochMs <= right.epochMs);
    }
  }

  // Date vs String (parseable as date)
  if (left.type === "date" && right.type === "string") {
    const parsed = parseDate(right.value, "UTC");
    if (parsed.type === "error") {
      return errorVal(
        "TYPE002",
        "Invalid relational comparison: cannot parse string as date",
      );
    }
    return evalRelational(left, parsed, op);
  }
  if (left.type === "string" && right.type === "date") {
    const parsed = parseDate(left.value, "UTC");
    if (parsed.type === "error") {
      return errorVal(
        "TYPE002",
        "Invalid relational comparison: cannot parse string as date",
      );
    }
    return evalRelational(parsed, right, op);
  }

  return errorVal(
    "TYPE002",
    `Invalid relational comparison: ${left.type} ${op} ${right.type}`,
  );
}

function evalAdd(left: Value, right: Value, ctx: EvalContext): Value {
  // Date + Duration
  if (left.type === "date" && right.type === "duration") {
    return addDurationToDate(left, right, ctx.snapshot.timezone);
  }
  // Date + String (parseable as duration)
  if (left.type === "date" && right.type === "string") {
    const dur = parseDuration(right.value);
    if (dur.type === "error") return dur;
    return addDurationToDate(left, dur, ctx.snapshot.timezone);
  }
  // Duration + Duration
  if (left.type === "duration" && right.type === "duration") {
    return addDurations(left, right);
  }
  // Number + Number
  if (left.type === "number" && right.type === "number") {
    return num(left.value + right.value);
  }
  // String concatenation (§12.3)
  if (
    left.type === "string" || right.type === "string" ||
    left.type === "url" || right.type === "url"
  ) {
    // But not Date/Duration concatenation — those are handled above
    if (
      !((left.type === "date" || left.type === "duration") &&
        right.type === "string") &&
      !((right.type === "date" || right.type === "duration") &&
        left.type === "string")
    ) {
      return str(valueToString(left) + valueToString(right));
    }
  }
  // List + List
  if (left.type === "list" && right.type === "list") {
    return listVal([...left.items, ...right.items]);
  }
  // Date + Date is not valid
  if (left.type === "date" && right.type === "date") {
    return errorVal("TYPE003", "Cannot add two dates");
  }
  return errorVal(
    "TYPE003",
    `Invalid arithmetic: ${left.type} + ${right.type}`,
  );
}

function evalSub(left: Value, right: Value, ctx: EvalContext): Value {
  // Date - Duration
  if (left.type === "date" && right.type === "duration") {
    return subtractDurationFromDate(left, right, ctx.snapshot.timezone);
  }
  // Date - String (parseable as duration)
  if (left.type === "date" && right.type === "string") {
    const dur = parseDuration(right.value);
    if (dur.type === "error") return dur;
    return subtractDurationFromDate(left, dur, ctx.snapshot.timezone);
  }
  // Date - Date → Duration
  if (left.type === "date" && right.type === "date") {
    return dateMinusDate(left, right);
  }
  // Duration - Duration
  if (left.type === "duration" && right.type === "duration") {
    return subtractDurations(left, right);
  }
  // Number - Number
  if (left.type === "number" && right.type === "number") {
    return num(left.value - right.value);
  }
  return errorVal(
    "TYPE003",
    `Invalid arithmetic: ${left.type} - ${right.type}`,
  );
}

function evalMul(left: Value, right: Value, _ctx: EvalContext): Value {
  // Duration * Number
  if (left.type === "duration" && right.type === "number") {
    return multiplyDuration(left, right.value);
  }
  // Number * Number
  if (left.type === "number" && right.type === "number") {
    return num(left.value * right.value);
  }
  // Number * Duration is NOT supported (§12.4)
  if (left.type === "number" && right.type === "duration") {
    return errorVal(
      "TYPE003",
      "Number * Duration not supported; Duration must be on the left",
    );
  }
  return errorVal(
    "TYPE003",
    `Invalid arithmetic: ${left.type} * ${right.type}`,
  );
}

function evalDiv(left: Value, right: Value, _ctx: EvalContext): Value {
  // Duration / Number
  if (left.type === "duration" && right.type === "number") {
    return divideDuration(left, right.value);
  }
  // Number / Number
  if (left.type === "number" && right.type === "number") {
    if (right.value === 0) {
      if (left.value === 0) return num(NaN);
      return num(left.value > 0 ? Infinity : -Infinity);
    }
    return num(left.value / right.value);
  }
  return errorVal(
    "TYPE003",
    `Invalid arithmetic: ${left.type} / ${right.type}`,
  );
}

function evalMod(left: Value, right: Value): Value {
  if (left.type === "number" && right.type === "number") {
    if (right.value === 0) return num(NaN);
    return num(left.value % right.value);
  }
  return errorVal(
    "TYPE003",
    `Invalid arithmetic: ${left.type} % ${right.type}`,
  );
}

// ---------------------------------------------------------------------------
// Member access (§9.3)
// ---------------------------------------------------------------------------

function evalMember(
  node: AstNode & { kind: "member" },
  ctx: EvalContext,
): Value {
  // Special: namespace resolution for note, file, formula, this
  if (node.object.kind === "identifier") {
    const nsName = (node.object as { name: string }).name;
    if (nsName === "note" && ctx.rowScope) {
      const val = ctx.rowScope.note.map.get(node.property);
      return val ?? NULL;
    }
    if (nsName === "file" && ctx.rowScope) {
      return resolveFileField(node.property, ctx);
    }
    if (nsName === "formula" && ctx.rowScope) {
      return resolveFormulaRef(node.property, ctx);
    }
    if (nsName === "this" && ctx.rowScope) {
      if (node.property === "file") {
        return ctx.rowScope.this;
      }
      return NULL;
    }
  }

  const obj = evaluate(node.object, ctx);
  if (obj.type === "error") return obj;
  return resolveMember(obj, node.property, ctx);
}

function resolveFileField(field: string, ctx: EvalContext): Value {
  const file = ctx.rowScope!.file;
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
    case "properties": {
      // Return the note ObjectValue (frontmatter properties)
      return ctx.rowScope!.note;
    }
    case "tags": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      return listVal(ctx.host.getTags(hf).map((t) => str(t)));
    }
    case "links": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      const links = ctx.host.getOutgoingLinks(hf);
      return listVal(links.map((l) => ({
        type: "link" as const,
        target: l.target,
        sourcePath: file.path,
        resolvedPath: l.resolvedPath,
      })));
    }
    case "backlinks": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      const backlinks = ctx.host.getBacklinks(hf);
      // Import hostFileToFileValue lazily to avoid circular dependency
      return listVal(backlinks.map((bf) => ({
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
      })));
    }
    case "embeds": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      const embeds = ctx.host.getEmbeds(hf);
      return listVal(embeds.map((l) => ({
        type: "link" as const,
        target: l.target,
        sourcePath: file.path,
        resolvedPath: l.resolvedPath,
      })));
    }
    default:
      // Check if it's a method
      return NULL;
  }
}

function resolveFormulaRef(name: string, ctx: EvalContext): Value {
  if (!ctx.rowScope) return NULL;
  return ctx.rowScope.formula.resolve(name) ?? NULL;
}

function resolveMember(obj: Value, property: string, ctx: EvalContext): Value {
  if (obj.type === "null") return NULL;

  if (obj.type === "object") {
    const val = obj.map.get(property);
    return val ?? NULL;
  }

  if (obj.type === "file") {
    // File fields accessible via file.xxx
    return resolveFileFieldFromValue(obj, property, ctx);
  }

  if (obj.type === "date") {
    return resolveDateField(obj, property, ctx);
  }

  if (obj.type === "string") {
    if (property === "length") return num(obj.value.length);
  }

  if (obj.type === "url") {
    if (property === "length") return num(obj.url.length);
  }

  if (obj.type === "list") {
    if (property === "length") return num(obj.items.length);
  }

  if (obj.type === "link") {
    if (property === "target") return str(obj.target);
    if (property === "display") return obj.display ?? NULL;
  }

  // For other types, member access returns null (method resolution happens in call)
  return NULL;
}

function resolveFileFieldFromValue(
  file: FileValue,
  field: string,
  ctx: EvalContext,
): Value {
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
    case "properties": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return { type: "object", map: new Map() };
      // We need the note ObjectValue — but we can reconstruct it from frontmatter
      // Actually, the row scope has it, but we don't have the row scope here
      // Let's reconstruct from the host
      return NULL; // Will be handled via the note namespace
    }
    case "tags": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      return listVal(ctx.host.getTags(hf).map((t) => str(t)));
    }
    case "links": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      const links = ctx.host.getOutgoingLinks(hf);
      return listVal(links.map((l) => ({
        type: "link" as const,
        target: l.target,
        sourcePath: file.path,
        resolvedPath: l.resolvedPath,
      })));
    }
    case "backlinks": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      const backlinks = ctx.host.getBacklinks(hf);
      return listVal(backlinks.map((bf) => ({
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
      })));
    }
    case "embeds": {
      const hf = ctx.host.getFile(file.path);
      if (!hf) return listVal([]);
      const embeds = ctx.host.getEmbeds(hf);
      return listVal(embeds.map((l) => ({
        type: "link" as const,
        target: l.target,
        sourcePath: file.path,
        resolvedPath: l.resolvedPath,
      })));
    }
    default:
      return NULL;
  }
}

function resolveDateField(
  date: DateValue,
  field: string,
  ctx: EvalContext,
): Value {
  const tz = ctx.snapshot.timezone;
  const offset = getTimezoneOffsetMs(tz, date.epochMs);
  const d = new Date(date.epochMs + offset);
  switch (field) {
    case "year":
      return num(d.getUTCFullYear());
    case "month":
      return num(d.getUTCMonth() + 1);
    case "day":
      return num(d.getUTCDate());
    case "hour":
      return num(d.getUTCHours());
    case "minute":
      return num(d.getUTCMinutes());
    case "second":
      return num(d.getUTCSeconds());
    case "millisecond":
      return num(d.getUTCMilliseconds());
    default:
      return NULL;
  }
}

// ---------------------------------------------------------------------------
// Index access (§9.3)
// ---------------------------------------------------------------------------

function evalIndex(node: AstNode & { kind: "index" }, ctx: EvalContext): Value {
  // Special: note["property name"], formula["name"]
  if (node.object.kind === "identifier") {
    const nsName = (node.object as { name: string }).name;
    if (nsName === "note" && ctx.rowScope) {
      const idx = evaluate(node.index, ctx);
      if (idx.type === "string") {
        const val = ctx.rowScope.note.map.get(idx.value);
        return val ?? NULL;
      }
    }
    if (nsName === "formula" && ctx.rowScope) {
      // Only constant string literal keys are allowed; dynamic keys → REF003
      if (node.index.kind === "literal" && node.index.value.type === "string") {
        const key = (node.index.value as { value: string }).value;
        return ctx.rowScope.formula.resolve(key) ?? NULL;
      }
      return errorVal(
        "REF003",
        "Dynamic formula key not statically resolvable",
      );
    }
  }

  const obj = evaluate(node.object, ctx);
  if (obj.type === "error") return obj;
  const idx = evaluate(node.index, ctx);
  if (idx.type === "error") return idx;

  if (obj.type === "list") {
    if (idx.type !== "number") return NULL;
    const i = idx.value;
    if (!Number.isInteger(i) || i < 0 || i >= obj.items.length) return NULL;
    return obj.items[i];
  }

  if (obj.type === "object") {
    if (idx.type !== "string") return NULL;
    return obj.map.get(idx.value) ?? NULL;
  }

  if (obj.type === "null") return NULL;

  // String bracket index is not supported (§9.3)
  if (obj.type === "string") return NULL;

  return NULL;
}

// ---------------------------------------------------------------------------
// Function/method calls (§19, §20-28)
// ---------------------------------------------------------------------------

function evalCall(node: AstNode & { kind: "call" }, ctx: EvalContext): Value {
  // Special form: if(condition, trueResult, falseResult?)
  if (
    node.callee.kind === "identifier" &&
    (node.callee as { name: string }).name === "if"
  ) {
    return evalIf(node.args, ctx);
  }

  // Method call: expr.method(args) or expr["method"](args)
  let receiver: Value | null = null;
  let methodName: string | null = null;
  let isMethodCall = false;

  if (node.callee.kind === "member") {
    const member = node.callee as AstNode & { kind: "member" };
    // Check if it's a namespace member (note.xxx, file.xxx, formula.xxx)
    if (member.object.kind === "identifier") {
      const nsName = (member.object as { name: string }).name;
      if (nsName === "file" && ctx.rowScope) {
        // File method call
        receiver = ctx.rowScope.file;
        methodName = member.property;
        isMethodCall = true;
      } else if (nsName === "note" && ctx.rowScope) {
        // note.property.method() — evaluate the property first
        const propVal = ctx.rowScope.note.map.get(member.property);
        if (propVal !== undefined) {
          receiver = propVal;
          methodName = null; // Will be determined by the next level
        }
        // If property not found, fall through to evaluate the member
      }
    }
  }

  if (isMethodCall && receiver && methodName) {
    return evalMethodCall(receiver, methodName, node.args, ctx);
  }

  // Global function call
  if (node.callee.kind === "identifier") {
    const fnName = (node.callee as { name: string }).name;
    const fn = globalFunctions[fnName];
    if (!fn) {
      // Record diagnostic
      ctx.diagnostics.push({
        code: "NAME001",
        severity: "error",
        message: `Unknown global function: ${fnName}`,
        span: node.span,
      });
      return errorVal("NAME001", `Unknown global function: ${fnName}`);
    }
    const args = node.args.map((a) => evaluate(a, ctx));
    // Check for errors in args
    for (const a of args) if (a.type === "error") return a;
    return fn(args, ctx);
  }

  // Method call on evaluated expression
  if (node.callee.kind === "member") {
    const member = node.callee as AstNode & { kind: "member" };
    const obj = evaluate(member.object, ctx);
    if (obj.type === "error") return obj;
    return evalMethodCall(obj, member.property, node.args, ctx);
  }

  // Index-based method call: expr["method"](args)
  if (node.callee.kind === "index") {
    const index = node.callee as AstNode & { kind: "index" };
    const obj = evaluate(index.object, ctx);
    if (obj.type === "error") return obj;
    const methodNameVal = evaluate(index.index, ctx);
    if (methodNameVal.type === "error") return methodNameVal;
    if (methodNameVal.type !== "string") {
      return errorVal("TYPE001", "Method name must be a string");
    }
    return evalMethodCall(obj, methodNameVal.value, node.args, ctx);
  }

  return errorVal("EVAL002", "Invalid call expression");
}

function evalIf(args: AstNode[], ctx: EvalContext): Value {
  if (args.length < 2 || args.length > 3) {
    return errorVal("ARITY001", "if() expects 2 or 3 arguments");
  }
  const condition = evaluate(args[0], ctx);
  if (condition.type === "error") return condition;
  try {
    if (isTruthy(condition)) {
      return evaluate(args[1], ctx);
    } else {
      if (args.length === 3) {
        return evaluate(args[2], ctx);
      }
      return NULL;
    }
  } catch (e) {
    return e as ErrorValue;
  }
}

function evalMethodCall(
  receiver: Value,
  methodName: string,
  args: AstNode[],
  ctx: EvalContext,
): Value {
  if (receiver.type === "error") return receiver;

  // Special forms: filter, map, reduce (§9.5, §24)
  if (receiver.type === "list") {
    if (methodName === "filter") {
      return evalListFilter(receiver, args, ctx);
    }
    if (methodName === "map") {
      return evalListMap(receiver, args, ctx);
    }
    if (methodName === "reduce") {
      return evalListReduce(receiver, args, ctx);
    }
    if (methodName === "mean") {
      // mean() is available in summary context, but also on lists (§24.7)
      const numbers = receiver.items.filter((v) =>
        v.type === "number"
      ) as NumberValue[];
      if (numbers.length === 0) return NULL;
      const sum = numbers.reduce((acc, n) => acc + n.value, 0);
      return num(sum / numbers.length);
    }
  }

  // Check common methods first (isTruthy, isType, toString)
  const common = commonMethods[methodName];
  if (common) {
    const argVals = args.map((a) => evaluate(a, ctx));
    for (const a of argVals) if (a.type === "error") return a;
    return common(receiver, argVals, ctx);
  }

  // isEmpty — null-safe (§20)
  if (methodName === "isEmpty") {
    if (receiver.type === "null") return TRUE;
    const argVals = args.map((a) => evaluate(a, ctx));
    for (const a of argVals) if (a.type === "error") return a;
    try {
      return bool(isEmpty(receiver));
    } catch (e) {
      return e as ErrorValue;
    }
  }

  // Type-specific methods
  const typeMap = typeMethods[receiver.type];
  if (typeMap) {
    const method = typeMap[methodName];
    if (method) {
      const argVals = args.map((a) => evaluate(a, ctx));
      for (const a of argVals) if (a.type === "error") return a;
      return method(receiver, argVals, ctx);
    }
  }

  // Record diagnostic
  ctx.diagnostics.push({
    code: "NAME002",
    severity: "error",
    message: `Unknown method '${methodName}' on type '${receiver.type}'`,
    span: {
      startOffset: 0,
      endOffset: 0,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    },
  });
  return errorVal(
    "NAME002",
    `Unknown method '${methodName}' on type '${receiver.type}'`,
  );
}

// ---------------------------------------------------------------------------
// List special forms (§24)
// ---------------------------------------------------------------------------

function evalListFilter(
  list: ListValue,
  args: AstNode[],
  ctx: EvalContext,
): Value {
  if (args.length !== 1) {
    return errorVal("ARITY001", "filter() expects 1 argument");
  }
  const predicateAst = args[0];
  const result: Value[] = [];
  for (let i = 0; i < list.items.length; i++) {
    const itemCtx: EvalContext = {
      ...ctx,
      locals: new Map([
        ["value", list.items[i]],
        ["index", num(i)],
        ...(ctx.locals ? [...ctx.locals] : []),
      ]),
    };
    const pred = evaluate(predicateAst, itemCtx);
    if (pred.type === "error") {
      ctx.diagnostics.push({
        code: pred.code,
        severity: "error",
        message: pred.message,
      });
      continue;
    }
    try {
      if (isTruthy(pred)) result.push(list.items[i]);
    } catch (e) {
      const err = e as ErrorValue;
      ctx.diagnostics.push({
        code: err.code,
        severity: "error",
        message: err.message,
      });
    }
  }
  return listVal(result);
}

function evalListMap(
  list: ListValue,
  args: AstNode[],
  ctx: EvalContext,
): Value {
  if (args.length !== 1) {
    return errorVal("ARITY001", "map() expects 1 argument");
  }
  const mapAst = args[0];
  const result: Value[] = [];
  for (let i = 0; i < list.items.length; i++) {
    const itemCtx: EvalContext = {
      ...ctx,
      locals: new Map([
        ["value", list.items[i]],
        ["index", num(i)],
        ...(ctx.locals ? [...ctx.locals] : []),
      ]),
    };
    const mapped = evaluate(mapAst, itemCtx);
    result.push(mapped);
  }
  return listVal(result);
}

function evalListReduce(
  list: ListValue,
  args: AstNode[],
  ctx: EvalContext,
): Value {
  if (args.length !== 2) {
    return errorVal("ARITY001", "reduce() expects 2 arguments");
  }
  const reduceAst = args[0];
  const initial = evaluate(args[1], ctx);
  if (initial.type === "error") return initial;

  let acc = initial;
  for (let i = 0; i < list.items.length; i++) {
    const itemCtx: EvalContext = {
      ...ctx,
      locals: new Map([
        ["value", list.items[i]],
        ["index", num(i)],
        ["acc", acc],
        ...(ctx.locals ? [...ctx.locals] : []),
      ]),
    };
    const result = evaluate(reduceAst, itemCtx);
    if (result.type === "error") return result;
    acc = result;
  }
  return acc;
}
