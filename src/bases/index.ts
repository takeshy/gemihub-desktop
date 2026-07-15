// Public API for the Bases query and view engine.
// Profile: OBX-2026-06

import type {
  BasesHostAdapter,
  CompiledBase,
  QueryResult,
  QuerySnapshot,
} from "./types";
import { queryView } from "./query";

export { compileBase } from "./formula";
export { queryView } from "./query";
export { evaluate } from "./evaluator";
export { parseExpression } from "./parser";
export { normalizePropertyId, parseBaseConfig } from "./config";
export { createGemiHubHost, createTestHost } from "./host";
export type {
  BaseEntry,
  BaseEntryGroup,
  BasesHostAdapter,
  CompiledBase,
  Diagnostic,
  EvalContext,
  FilterNode,
  HostFile,
  HostLink,
  NormalizedBaseConfig,
  QueryResult,
  QuerySnapshot,
  Value,
  ViewConfig,
} from "./types";
export { valueToCanonical } from "./values";

export function query(
  base: CompiledBase,
  viewName: string,
  host: BasesHostAdapter,
  snapshot: QuerySnapshot,
): QueryResult {
  return queryView(base, viewName, host, snapshot);
}
