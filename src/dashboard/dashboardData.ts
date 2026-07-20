import yaml from "js-yaml";
import { parseFrontmatter } from "../components/FrontmatterEditor";
import {
  fileInventory,
  listWorkspaceDirectoryEntries,
  listWorkspaceFiles,
  readFile,
  readWorkspaceFile,
} from "../lib/wailsBackend";

export interface DashboardDataRow {
  id: string;
  path: string;
  name: string;
  mtime: number;
  ctime: number;
  content: string;
  frontmatter: Record<string, unknown>;
  cells: Record<string, unknown>;
}

export interface BaseViewDefinition {
  type: "table" | "cards" | "list" | string;
  name: string;
  order: string[];
  limit?: number;
  filters?: unknown;
  sort?: Array<{ property?: string; direction?: string }>;
  [key: string]: unknown;
}

export interface BaseDefinition {
  filters?: unknown;
  formulas?: Record<string, string>;
  properties?: Record<string, { displayName?: string; [key: string]: unknown }>;
  views: BaseViewDefinition[];
  [key: string]: unknown;
}

export interface KanbanDefinition {
  version?: number;
  folder?: string;
  title?: string;
  statusProperty?: string;
  titleProperty?: string;
  columns?: Array<string | { value?: string; label?: string }>;
  showUnspecified?: boolean;
  displayFields?: Array<
    string | { field?: string; label?: string; maxLength?: number }
  >;
  filter?: unknown;
  cardOrder?: string[];
  timelineName?: string;
  limit?: number;
  [key: string]: unknown;
}

function inFolder(path: string, folder: string): boolean {
  const normalized = folder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  return !normalized || path === normalized ||
    path.startsWith(`${normalized}/`);
}

function tags(frontmatter: Record<string, unknown>, content: string): string[] {
  const raw = frontmatter.tags;
  const values = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
    ? raw.split(/[ ,]+/)
    : [];
  return [
    ...new Set([
      ...values.map((value) => value.replace(/^#/, "")),
      ...[...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) =>
        match[1]
      ),
    ]),
  ];
}

export async function loadDashboardRows(
  folder = "",
  scope: "workspace" | "files" = "files",
): Promise<DashboardDataRow[]> {
  const workspace = scope === "workspace";
  const entries =
    (workspace && folder
      ? await listWorkspaceDirectoryEntries(folder)
      : workspace
      ? await listWorkspaceFiles()
      : await fileInventory()).filter(
        (entry) =>
          !entry.binary && /\.md(?:own)?$/i.test(entry.path) &&
          inFolder(entry.path, folder),
      ).slice(0, 1000);
  const rows: Array<DashboardDataRow | null> = await Promise.all(
    entries.map(async (entry): Promise<DashboardDataRow | null> => {
      const file = workspace
        ? await readWorkspaceFile(entry.path)
        : await readFile(entry.path);
      if (!file) return null;
      const parsed = parseFrontmatter(file.content);
      const name = entry.path.split("/").pop()?.replace(/\.md(?:own)?$/i, "") ||
        entry.path;
      const fileTags = tags(parsed.frontmatter, file.content);
      return {
        id: entry.path,
        path: entry.path,
        name,
        mtime: entry.modTime,
        ctime: entry.createdTime,
        content: file.content,
        frontmatter: parsed.frontmatter,
        cells: {
          ...parsed.frontmatter,
          "file.path": entry.path,
          "file.name": name,
          "file.content": parsed.body,
          "file.mtime": entry.modTime,
          "file.ctime": entry.createdTime,
          "file.size": entry.size,
          "file.tags": fileTags,
          name,
        },
      } satisfies DashboardDataRow;
    }),
  );
  return rows.filter((row): row is DashboardDataRow => row !== null);
}

export function parseBaseDefinition(content: string): BaseDefinition | null {
  try {
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const root = parsed as Record<string, unknown>;
    const views = Array.isArray(root.views)
      ? root.views.flatMap((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return [];
        }
        const view = value as Record<string, unknown>;
        return [{
          ...view,
          type: typeof view.type === "string" ? view.type : "table",
          name: typeof view.name === "string" ? view.name : `View ${index + 1}`,
          order: Array.isArray(view.order)
            ? view.order.filter((item): item is string =>
              typeof item === "string"
            )
            : [],
        } as BaseViewDefinition];
      })
      : [];
    return { ...root, views } as BaseDefinition;
  } catch {
    return null;
  }
}

export function parseKanbanDefinition(
  content: string,
): KanbanDefinition | null {
  try {
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as KanbanDefinition
      : null;
  } catch {
    return null;
  }
}

export function folderFromBaseFilters(filters: unknown): string {
  if (typeof filters === "string") {
    return filters.match(/file\.inFolder\(["']([^"']+)["']\)/i)?.[1] ?? "";
  }
  if (Array.isArray(filters)) {
    for (const item of filters) {
      const found = folderFromBaseFilters(item);
      if (found) return found;
    }
  }
  if (filters && typeof filters === "object") {
    for (const item of Object.values(filters as Record<string, unknown>)) {
      const found = folderFromBaseFilters(item);
      if (found) {
        return found;
      }
    }
  }
  return "";
}

function value(row: DashboardDataRow, property: string): unknown {
  if (property === "name") return row.name;
  if (property === "mtime") return row.mtime;
  if (property === "ctime") return row.ctime;
  const key = property.replace(/^note\./, "");
  return row.cells[key] ?? row.cells[property];
}

export function baseCellValue(
  row: DashboardDataRow,
  property: string,
): unknown {
  return value(row, property);
}

/** Match GemiHub's compact Base-widget display for filesystem timestamps. */
export function formatBaseCellValue(
  row: DashboardDataRow,
  property: string,
  locale?: string,
): string {
  const result = baseCellValue(row, property);
  const normalized = property.replace(/^file\./, "");
  if (normalized === "mtime" || normalized === "ctime") {
    const ms = typeof result === "number"
      ? result
      : typeof result === "string"
      ? Date.parse(result)
      : NaN;
    if (!Number.isFinite(ms) || ms <= 0) return "";
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  }
  return Array.isArray(result) ? result.join(", ") : String(result ?? "");
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  const leftDate = typeof left === "string" && /^\d{4}-\d{2}-\d{2}/.test(left)
    ? Date.parse(left)
    : NaN;
  const rightDate =
    typeof right === "string" && /^\d{4}-\d{2}-\d{2}/.test(right)
      ? Date.parse(right)
      : NaN;
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortBaseRows(
  rows: DashboardDataRow[],
  sort: BaseViewDefinition["sort"] | string | undefined,
): DashboardDataRow[] {
  const rules = typeof sort === "string"
    ? [{
      property: sort.replace(/^-/, ""),
      direction: sort.startsWith("-") ? "DESC" : "ASC",
    }]
    : Array.isArray(sort)
    ? sort
    : [];
  if (rules.length === 0) return rows;
  return [...rows].sort((left, right) => {
    for (const rule of rules) {
      const property = rule.property?.trim();
      if (!property) continue;
      const result = compareValues(
        value(left, property),
        value(right, property),
      );
      if (result !== 0) {
        return /desc/i.test(rule.direction || "") ? -result : result;
      }
    }
    return left.path.localeCompare(right.path);
  });
}

export function searchBaseRows(
  rows: DashboardDataRow[],
  query: string,
): DashboardDataRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.path, row.name, ...Object.values(row.cells)].some((entry) => {
      const text = Array.isArray(entry) ? entry.join(" ") : String(entry ?? "");
      return text.toLocaleLowerCase().includes(needle);
    })
  );
}

export function basePropertyLabel(
  definition: BaseDefinition | null,
  property: string,
): string {
  const bare = property.replace(/^note\./, "");
  return definition?.properties?.[property]?.displayName ||
    definition?.properties?.[`note.${bare}`]?.displayName ||
    definition?.properties?.[bare]?.displayName || formatBasePropertyLabel(
      property,
    );
}

function formatBasePropertyLabel(property: string): string {
  const separator = property.indexOf(".");
  if (separator < 0) return property;
  const namespace = property.slice(0, separator);
  return ["note", "file", "formula"].includes(namespace)
    ? property.slice(separator + 1)
    : property;
}

function statementMatches(row: DashboardDataRow, statement: string): boolean {
  const folder = statement.match(/file\.inFolder\(["']([^"']+)["']\)/i);
  if (folder) return inFolder(row.path, folder[1]);
  const tag = statement.match(/file\.hasTag\(["']#?([^"']+)["']\)/i);
  if (tag) return (row.cells["file.tags"] as string[]).includes(tag[1]);
  const comparison = statement.match(
    /^(?:note\.)?([\w.-]+)\s*(==|!=|>=|<=|>|<)\s*["']?([^"']+?)["']?$/,
  );
  if (!comparison) return true;
  const left = value(row, comparison[1]), rightText = comparison[3];
  const right = typeof left === "number" ? Number(rightText) : rightText;
  if (comparison[2] === "==") return String(left ?? "") === String(right);
  if (comparison[2] === "!=") return String(left ?? "") !== String(right);
  if (comparison[2] === ">") return Number(left) > Number(right);
  if (comparison[2] === "<") return Number(left) < Number(right);
  if (comparison[2] === ">=") return Number(left) >= Number(right);
  return Number(left) <= Number(right);
}

function conditionMatches(
  row: DashboardDataRow,
  condition: Record<string, unknown>,
): boolean {
  const property = typeof condition.property === "string"
    ? condition.property
    : "";
  const op = typeof condition.op === "string" ? condition.op : "";
  if (!property || !op) return true;
  const left = value(row, property), right = condition.value;
  if (op === "empty") {
    return left == null || left === "" ||
      (Array.isArray(left) && left.length === 0);
  }
  if (op === "notEmpty") {
    return !(left == null || left === "" ||
      (Array.isArray(left) && left.length === 0));
  }
  if (op === "isTrue") return left === true;
  if (op === "isFalse") return left === false;
  if (op === "contains" || op === "notContains") {
    const contains = Array.isArray(left)
      ? left.some((item) => String(item) === String(right))
      : String(left ?? "").includes(String(right ?? ""));
    return op === "contains" ? contains : !contains;
  }
  const compared = compareValues(left, right);
  if (op === "eq") return compared === 0;
  if (op === "neq") return left != null && compared !== 0;
  if (op === "gt" || op === "after") return compared > 0;
  if (op === "lt" || op === "before") return compared < 0;
  if (op === "gte") return compared >= 0;
  if (op === "lte") return compared <= 0;
  return true;
}

export function filterBaseRows(
  rows: DashboardDataRow[],
  filters: unknown,
): DashboardDataRow[] {
  const matches = (row: DashboardDataRow, node: unknown): boolean => {
    if (typeof node === "string") return statementMatches(row, node);
    if (Array.isArray(node)) return node.every((item) => matches(row, item));
    if (!node || typeof node !== "object") return true;
    const record = node as Record<string, unknown>;
    if (typeof record.property === "string" && typeof record.op === "string") {
      return conditionMatches(row, record);
    }
    if (Array.isArray(record.and)) {
      return record.and.every((item) => matches(row, item));
    }
    if (Array.isArray(record.or)) {
      return record.or.some((item) => matches(row, item));
    }
    if (Array.isArray(record.not)) {
      return !record.not.every((item) => matches(row, item));
    }
    return true;
  };
  return rows.filter((row) => matches(row, filters));
}
