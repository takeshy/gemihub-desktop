// Core types for the Bases-compatible query and view engine.
// Profile: OBX-2026-06

// ---------------------------------------------------------------------------
// Source spans
// ---------------------------------------------------------------------------

export interface SourceSpan {
  startOffset: number;
  endOffset: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface DiagnosticSource {
  basePath?: string;
  section?: "filters" | "formulas" | "properties" | "summaries" | "views";
  key?: string;
  viewName?: string;
  rowPath?: string;
}

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  source?: DiagnosticSource;
  span?: SourceSpan;
  cause?: Diagnostic;
}

// ---------------------------------------------------------------------------
// Value model — 16 types (§10)
// ---------------------------------------------------------------------------

export type ValueTypeName =
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "date"
  | "duration"
  | "list"
  | "object"
  | "file"
  | "link"
  | "url"
  | "regexp"
  | "html"
  | "image"
  | "icon"
  | "error";

export interface NullValue {
  type: "null";
}
export interface BooleanValue {
  type: "boolean";
  value: boolean;
}
export interface NumberValue {
  type: "number";
  value: number;
}
export interface StringValue {
  type: "string";
  value: string;
}
export interface DateValue {
  type: "date";
  epochMs: number;
  dateOnly: boolean;
}
export interface DurationValue {
  type: "duration";
  months: number;
  milliseconds: number;
}
export interface ListValue {
  type: "list";
  items: Value[];
}
export interface ObjectValue {
  type: "object";
  map: Map<string, Value>;
}
export interface FileValue {
  type: "file";
  path: string;
  name: string;
  basename: string;
  ext: string;
  folder: string;
  size: number;
  ctimeMs: number;
  mtimeMs: number;
}
export interface LinkValue {
  type: "link";
  target: string;
  sourcePath: string;
  display?: Value;
  resolvedPath?: string;
}
export interface UrlValue {
  type: "url";
  url: string;
  display?: Value;
}
export interface RegexpValue {
  type: "regexp";
  source: string;
  flags: string;
  re: RegExp;
}
export interface HtmlValue {
  type: "html";
  source: string;
}
export interface ImageValue {
  type: "image";
  source: string;
  resolvedPath?: string;
}
export interface IconValue {
  type: "icon";
  name: string;
}
export interface ErrorValue {
  type: "error";
  code: string;
  message: string;
}

export type Value =
  | NullValue
  | BooleanValue
  | NumberValue
  | StringValue
  | DateValue
  | DurationValue
  | ListValue
  | ObjectValue
  | FileValue
  | LinkValue
  | UrlValue
  | RegexpValue
  | HtmlValue
  | ImageValue
  | IconValue
  | ErrorValue;

export const NULL: NullValue = { type: "null" };
export const TRUE: BooleanValue = { type: "boolean", value: true };
export const FALSE: BooleanValue = { type: "boolean", value: false };

export function bool(b: boolean): BooleanValue {
  return b ? TRUE : FALSE;
}
export function num(n: number): NumberValue {
  return { type: "number", value: n };
}
export function str(s: string): StringValue {
  return { type: "string", value: s };
}
export function dateVal(epochMs: number, dateOnly: boolean): DateValue {
  return { type: "date", epochMs, dateOnly };
}
export function durVal(months: number, milliseconds: number): DurationValue {
  return { type: "duration", months, milliseconds };
}
export function listVal(items: Value[]): ListValue {
  return { type: "list", items };
}
export function objVal(entries: [string, Value][]): ObjectValue {
  return { type: "object", map: new Map(entries) };
}
export function errorVal(code: string, message: string): ErrorValue {
  return { type: "error", code, message };
}

// ---------------------------------------------------------------------------
// AST nodes (§8.2)
// ---------------------------------------------------------------------------

export type AstNode =
  | LiteralNode
  | IdentifierNode
  | ListExprNode
  | UnaryNode
  | BinaryNode
  | MemberNode
  | IndexNode
  | CallNode;

export interface LiteralNode {
  kind: "literal";
  value: Value;
  span: SourceSpan;
}
export interface IdentifierNode {
  kind: "identifier";
  name: string;
  span: SourceSpan;
}
export interface ListExprNode {
  kind: "list";
  elements: AstNode[];
  span: SourceSpan;
}
export interface UnaryNode {
  kind: "unary";
  op: string;
  operand: AstNode;
  span: SourceSpan;
}
export interface BinaryNode {
  kind: "binary";
  op: string;
  left: AstNode;
  right: AstNode;
  span: SourceSpan;
}
export interface MemberNode {
  kind: "member";
  object: AstNode;
  property: string;
  span: SourceSpan;
}
export interface IndexNode {
  kind: "index";
  object: AstNode;
  index: AstNode;
  span: SourceSpan;
}
export interface CallNode {
  kind: "call";
  callee: AstNode;
  args: AstNode[];
  span: SourceSpan;
}

// ---------------------------------------------------------------------------
// Tokens (§7)
// ---------------------------------------------------------------------------

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "NULL"
  | "IDENTIFIER"
  | "REGEXP"
  | "LPAREN"
  | "RPAREN"
  | "LBRACKET"
  | "RBRACKET"
  | "LBRACE"
  | "RBRACE"
  | "COMMA"
  | "COLON"
  | "DOT"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "PERCENT"
  | "BANG"
  | "AMPAMP"
  | "PIPEPIPE"
  | "EQEQ"
  | "BANGEQ"
  | "GT"
  | "LT"
  | "GTE"
  | "LTE"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string | number | boolean | null;
  regexpSource?: string;
  regexpFlags?: string;
  span: SourceSpan;
}

// ---------------------------------------------------------------------------
// Config types (§6)
// ---------------------------------------------------------------------------

export type FilterNode =
  | string
  | { and: FilterNode[] }
  | { or: FilterNode[] }
  | { not: FilterNode[] };

export interface PropertyConfig {
  displayName?: string;
  [key: string]: unknown;
}

export interface ViewConfig {
  type: string;
  name: string;
  filters?: FilterNode;
  groupBy?: { property: string; direction: "ASC" | "DESC" };
  order?: string[];
  sort?: Array<{ property: string; direction: "ASC" | "DESC" }>;
  summaries?: Record<string, string>;
  limit?: number;
  [key: string]: unknown;
}

export interface BaseConfig {
  filters?: FilterNode;
  formulas?: Record<string, string>;
  properties?: Record<string, PropertyConfig>;
  summaries?: Record<string, string>;
  views?: ViewConfig[];
  [key: string]: unknown;
}

// Normalized config with property IDs resolved
export interface NormalizedBaseConfig {
  filters?: FilterNode;
  formulas: Record<string, string>;
  properties: Record<string, PropertyConfig>;
  summaries: Record<string, string>;
  views: ViewConfig[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Host adapter (§5)
// ---------------------------------------------------------------------------

export interface HostLink {
  target: string;
  resolvedPath?: string;
}

export interface HostFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  size: number;
  ctimeMs: number;
  mtimeMs: number;
}

export type HostPropertyType =
  | "date"
  | "datetime"
  | "text"
  | "number"
  | "checkbox"
  | "list"
  | "multitext";

export interface QuerySnapshot {
  nowMs: number;
  timezone: string;
  locale: string;
  randomSequence: number[];
  randomIndex: number;
}

export interface BasesHostAdapter {
  enumerateFiles(): HostFile[];
  getFile(path: string): HostFile | null;
  getFrontmatter(file: HostFile): Record<string, unknown> | null;
  getPropertyTypes(file: HostFile): Record<string, HostPropertyType>;
  getTags(file: HostFile): string[];
  getOutgoingLinks(file: HostFile): HostLink[];
  getBacklinks(file: HostFile): HostFile[];
  getEmbeds(file: HostFile): HostLink[];
  resolveLink(target: string, sourcePath: string): HostFile | null;
  getDisplayContext(): HostFile | null;
  now(): number;
  random(): number;
  sanitizeHtml(input: string): string;
  isSupportedIcon(name: string): boolean;
}

// ---------------------------------------------------------------------------
// Query results
// ---------------------------------------------------------------------------

export interface BaseEntry {
  file: FileValue;
  rowScope: RowScope;
  formulaCache: Map<string, Value>;
}

export interface BaseEntryGroup {
  key: Value;
  entries: BaseEntry[];
  summaries: Map<string, Value>;
}

export interface QueryResult {
  data: BaseEntry[];
  groupedData: BaseEntryGroup[];
  properties: string[];
  diagnostics: Diagnostic[];
  getSummaryValue(
    entries: BaseEntry[],
    property: string,
    summary: string,
  ): Value;
}

// ---------------------------------------------------------------------------
// Evaluation scope
// ---------------------------------------------------------------------------

export interface RowScope {
  note: ObjectValue;
  file: FileValue;
  fileMeta: HostFile;
  formula: FormulaNamespace;
  this: Value;
}

export interface FormulaNamespace {
  names: string[];
  resolve: (name: string) => Value | undefined;
}

export interface EvalContext {
  snapshot: QuerySnapshot;
  host: BasesHostAdapter;
  rowScope?: RowScope;
  summaryValues?: ListValue;
  locals?: Map<string, Value>;
  diagnostics: Diagnostic[];
  formulaCache?: Map<string, Value>;
  evaluatingFormulas?: Set<string>;
}

// ---------------------------------------------------------------------------
// Compiled base
// ---------------------------------------------------------------------------

export interface CompiledFormula {
  name: string;
  expression: string;
  ast: AstNode;
  dependencies: Set<string>;
}

export interface CompiledBase {
  profile: "OBX-2026-06";
  config: NormalizedBaseConfig;
  formulas: Map<string, CompiledFormula>;
  customSummaries: Map<string, CompiledFormula>;
  diagnostics: Diagnostic[];
}
