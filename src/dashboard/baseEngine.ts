import { compileBase, createGemiHubHost, queryView } from "../bases/index";
import { resolveProperty } from "../bases/query";
import type {
  BasesHostAdapter,
  CompiledBase,
  QueryResult,
  QuerySnapshot,
  Value,
  ViewConfig,
} from "../bases/types";
import { valueToString } from "../bases/values";
import type { DashboardDataRow } from "./dashboardData";

export interface BaseVaultFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  createdTime?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

export interface BaseQueryData {
  compiled: CompiledBase;
  view: ViewConfig;
  result: QueryResult;
  rows: DashboardDataRow[];
}

export function queryBaseFiles(
  source: string,
  requestedView: string,
  files: BaseVaultFile[],
): BaseQueryData {
  const compiled = compileBase(source);
  const errors = compiled.diagnostics.filter((item) =>
    item.severity === "error"
  );
  if (errors.length > 0) throw new Error(errors[0].message);
  const view =
    compiled.config.views.find((item) => item.name === requestedView) ||
    compiled.config.views[0];
  if (!view) throw new Error("The Base file does not define a view.");
  const { host, snapshot } = createGemiHubHost({
    files,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigatorLocale(),
  });
  const result = queryView(compiled, view.name, host, snapshot);
  const contentByPath = new Map(
    files.map((file) => [file.name, file.content || ""]),
  );
  const rows = result.data.map((entry) =>
    entryToDashboardRow(
      entry,
      result.properties,
      contentByPath.get(entry.file.path) || "",
      host,
      snapshot,
    )
  );
  return { compiled, view, result, rows };
}

function entryToDashboardRow(
  entry: QueryResult["data"][number],
  properties: string[],
  content: string,
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
): DashboardDataRow {
  const frontmatter: Record<string, unknown> = {};
  const cells: Record<string, unknown> = {};
  for (const [key, value] of entry.rowScope.note.map) {
    const raw = baseValueToRaw(value);
    frontmatter[key] = raw;
    cells[key] = raw;
    cells[`note.${key}`] = raw;
  }
  for (const property of properties) {
    cells[property] = baseValueToRaw(
      resolveProperty(entry, property, host, snapshot, []),
    );
  }
  for (const name of entry.rowScope.formula.names) {
    cells[`formula.${name}`] = baseValueToRaw(
      entry.rowScope.formula.resolve(name) || { type: "null" },
    );
  }
  cells["file.path"] = entry.file.path;
  cells["file.name"] = entry.file.name;
  cells["file.basename"] = entry.file.basename;
  cells["file.folder"] = entry.file.folder;
  cells["file.ext"] = entry.file.ext;
  cells["file.size"] = entry.file.size;
  cells["file.ctime"] = entry.file.ctimeMs;
  cells["file.mtime"] = entry.file.mtimeMs;
  return {
    id: entry.file.path,
    path: entry.file.path,
    name: entry.file.basename,
    mtime: entry.file.mtimeMs,
    ctime: entry.file.ctimeMs,
    content,
    frontmatter,
    cells,
  };
}

export function baseValueToRaw(value: Value): unknown {
  switch (value.type) {
    case "null":
      return null;
    case "boolean":
    case "number":
    case "string":
      return value.value;
    case "date":
      return valueToString(value);
    case "duration":
      return valueToString(value);
    case "list":
      return value.items.map(baseValueToRaw);
    case "object":
      return Object.fromEntries(
        [...value.map].map(([key, item]) => [key, baseValueToRaw(item)]),
      );
    case "file":
      return value.path;
    case "link":
      return value.display ? baseValueToRaw(value.display) : value.target;
    case "url":
      return value.display ? baseValueToRaw(value.display) : value.url;
    case "regexp":
      return value.re.toString();
    case "html":
    case "image":
      return value.source;
    case "icon":
      return value.name;
    case "error":
      return `#${value.code}: ${value.message}`;
  }
}

function navigatorLocale(): string {
  return typeof navigator === "undefined" ? "en" : navigator.language || "en";
}
