// Config parsing, validation, and property ID normalization (§6).

import yaml from "js-yaml";
import type {
  Diagnostic,
  FilterNode,
  NormalizedBaseConfig,
  PropertyConfig,
  ViewConfig,
} from "./types";

// `version` was emitted by early llm-hub Base files. The upstream GemiHub
// engine does not require it, but accepting it keeps those files queryable.
const VALID_ROOT_KEYS = new Set([
  "version",
  "filters",
  "formulas",
  "properties",
  "summaries",
  "views",
]);
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

export interface ParseResult {
  config: NormalizedBaseConfig | null;
  diagnostics: Diagnostic[];
}

export function parseBaseConfig(yamlText: string): ParseResult {
  const diagnostics: Diagnostic[] = [];

  // Detect duplicate top-level YAML keys (YAML002)
  const dupKeys = detectDuplicateTopLevelKeys(yamlText);
  if (dupKeys.length > 0) {
    diagnostics.push({
      code: "YAML002",
      severity: "error",
      message: `Duplicate YAML key: ${dupKeys[0]}`,
    });
    return { config: null, diagnostics };
  }

  // Parse YAML safely
  let raw: unknown;
  try {
    raw = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA }) as unknown;
  } catch (e) {
    diagnostics.push({
      code: "YAML001",
      severity: "error",
      message: `YAML parse error: ${(e as Error).message}`,
    });
    return { config: null, diagnostics };
  }

  if (raw === null || raw === undefined) {
    // Empty mapping is valid
    raw = {};
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    diagnostics.push({
      code: "CFG001",
      severity: "error",
      message: "Root must be a mapping",
    });
    return { config: null, diagnostics };
  }

  const rawObj = raw as Record<string, unknown>;

  // Check for unknown root keys (CFG001)
  for (const key of Object.keys(rawObj)) {
    if (!VALID_ROOT_KEYS.has(key) && !key.startsWith("x-")) {
      diagnostics.push({
        code: "CFG001",
        severity: "error",
        message: `Unknown root key: ${key}`,
        source: {
          section: key as
            | "filters"
            | "formulas"
            | "properties"
            | "summaries"
            | "views",
        },
      });
    }
  }

  if (diagnostics.some((d) => d.code === "CFG001")) {
    return { config: null, diagnostics };
  }

  // Validate and normalize
  const config: NormalizedBaseConfig = {
    formulas: {},
    properties: {},
    summaries: {},
    views: [],
  };

  // filters
  if (rawObj.filters !== undefined) {
    const filterDiag = validateFilterNode(rawObj.filters, "filters");
    if (filterDiag) {
      diagnostics.push(filterDiag);
    } else {
      config.filters = rawObj.filters as FilterNode;
    }
  }

  // formulas
  if (rawObj.formulas !== undefined) {
    if (typeof rawObj.formulas !== "object" || Array.isArray(rawObj.formulas)) {
      diagnostics.push({
        code: "CFG002",
        severity: "error",
        message: "formulas must be a mapping",
      });
    } else {
      for (
        const [name, expr] of Object.entries(
          rawObj.formulas as Record<string, unknown>,
        )
      ) {
        if (name === "") {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: "Formula name cannot be empty",
          });
          continue;
        }
        if (typeof expr !== "string") {
          diagnostics.push({
            code: "CFG010",
            severity: "error",
            message: `Formula '${name}' is not a string`,
            source: { section: "formulas", key: name },
          });
          continue;
        }
        config.formulas[name] = expr;
      }
    }
  }

  // properties
  if (rawObj.properties !== undefined) {
    if (
      typeof rawObj.properties !== "object" || Array.isArray(rawObj.properties)
    ) {
      diagnostics.push({
        code: "CFG002",
        severity: "error",
        message: "properties must be a mapping",
      });
    } else {
      for (
        const [key, val] of Object.entries(
          rawObj.properties as Record<string, unknown>,
        )
      ) {
        const normalizedKey = normalizePropertyId(key);
        if (typeof val !== "object" || val === null || Array.isArray(val)) {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: `Property config '${key}' must be an object`,
            source: { section: "properties", key },
          });
          continue;
        }
        const pc = val as PropertyConfig;
        if (
          pc.displayName !== undefined && typeof pc.displayName !== "string"
        ) {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: `Property '${key}' displayName must be a string`,
            source: { section: "properties", key },
          });
        }
        config.properties[normalizedKey] = pc;
      }
    }
  }

  // summaries
  if (rawObj.summaries !== undefined) {
    if (
      typeof rawObj.summaries !== "object" || Array.isArray(rawObj.summaries)
    ) {
      diagnostics.push({
        code: "CFG002",
        severity: "error",
        message: "summaries must be a mapping",
      });
    } else {
      for (
        const [name, expr] of Object.entries(
          rawObj.summaries as Record<string, unknown>,
        )
      ) {
        if (name === "") {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: "Summary name cannot be empty",
          });
          continue;
        }
        if (BUILTIN_SUMMARY_NAMES.has(name)) {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: `Custom summary name '${name}' conflicts with built-in`,
            source: { section: "summaries", key: name },
          });
          continue;
        }
        if (typeof expr !== "string") {
          diagnostics.push({
            code: "CFG010",
            severity: "error",
            message: `Summary '${name}' is not a string`,
            source: { section: "summaries", key: name },
          });
          continue;
        }
        config.summaries[name] = expr;
      }
    }
  }

  // views
  if (rawObj.views !== undefined) {
    if (!Array.isArray(rawObj.views)) {
      diagnostics.push({
        code: "CFG002",
        severity: "error",
        message: "views must be an array",
      });
    } else {
      const viewNames = new Set<string>();
      for (let i = 0; i < rawObj.views.length; i++) {
        const v = rawObj.views[i];
        if (typeof v !== "object" || v === null || Array.isArray(v)) {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: `View ${i} must be an object`,
          });
          continue;
        }
        const view = v as Record<string, unknown>;

        // type and name required
        if (typeof view.type !== "string" || view.type === "") {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: `View ${i} type must be a non-empty string`,
          });
          continue;
        }
        if (typeof view.name !== "string" || view.name === "") {
          diagnostics.push({
            code: "CFG002",
            severity: "error",
            message: `View ${i} name must be a non-empty string`,
          });
          continue;
        }

        // Duplicate view name (CFG003)
        if (viewNames.has(view.name)) {
          diagnostics.push({
            code: "CFG003",
            severity: "error",
            message: `Duplicate view name: ${view.name}`,
            source: { section: "views", viewName: view.name },
          });
          continue;
        }
        viewNames.add(view.name);

        const vc: ViewConfig = { type: view.type, name: view.name };

        // filters
        if (view.filters !== undefined) {
          const fd = validateFilterNode(view.filters, "views");
          if (fd) {
            diagnostics.push(fd);
          } else {
            vc.filters = view.filters as FilterNode;
          }
        }

        // groupBy
        if (view.groupBy !== undefined) {
          if (typeof view.groupBy !== "object" || view.groupBy === null) {
            diagnostics.push({
              code: "CFG002",
              severity: "error",
              message: `View '${view.name}' groupBy must be an object`,
            });
          } else {
            const gb = view.groupBy as Record<string, unknown>;
            if (typeof gb.property !== "string") {
              diagnostics.push({
                code: "CFG002",
                severity: "error",
                message:
                  `View '${view.name}' groupBy.property must be a string`,
              });
            } else if (gb.direction !== "ASC" && gb.direction !== "DESC") {
              diagnostics.push({
                code: "CFG002",
                severity: "error",
                message:
                  `View '${view.name}' groupBy.direction must be ASC or DESC`,
              });
            } else {
              vc.groupBy = {
                property: normalizePropertyId(gb.property),
                direction: gb.direction,
              };
            }
          }
        }

        // order
        if (view.order !== undefined) {
          if (!Array.isArray(view.order)) {
            diagnostics.push({
              code: "CFG002",
              severity: "error",
              message: `View '${view.name}' order must be an array`,
            });
          } else {
            const orderSet = new Set<string>();
            const orderList: string[] = [];
            for (const p of view.order) {
              if (typeof p !== "string") {
                diagnostics.push({
                  code: "CFG002",
                  severity: "error",
                  message: `View '${view.name}' order entries must be strings`,
                });
                continue;
              }
              const np = normalizePropertyId(p);
              if (orderSet.has(np)) {
                diagnostics.push({
                  code: "CFG003",
                  severity: "error",
                  message: `Duplicate order property: ${p}`,
                });
              }
              orderSet.add(np);
              orderList.push(np);
            }
            vc.order = orderList;
          }
        }

        // sort
        if (view.sort !== undefined) {
          if (!Array.isArray(view.sort)) {
            diagnostics.push({
              code: "CFG002",
              severity: "error",
              message: `View '${view.name}' sort must be an array`,
            });
          } else {
            const sortSet = new Set<string>();
            for (const s of view.sort) {
              if (typeof s !== "object" || s === null) {
                diagnostics.push({
                  code: "CFG002",
                  severity: "error",
                  message: `View '${view.name}' sort entries must be objects`,
                });
                continue;
              }
              const so = s as Record<string, unknown>;
              if (typeof so.property !== "string") {
                diagnostics.push({
                  code: "CFG002",
                  severity: "error",
                  message: `View '${view.name}' sort.property must be a string`,
                });
                continue;
              }
              if (so.direction !== "ASC" && so.direction !== "DESC") {
                diagnostics.push({
                  code: "CFG002",
                  severity: "error",
                  message:
                    `View '${view.name}' sort.direction must be ASC or DESC`,
                });
                continue;
              }
              const np = normalizePropertyId(so.property);
              if (sortSet.has(np)) {
                diagnostics.push({
                  code: "CFG003",
                  severity: "error",
                  message: `Duplicate sort property: ${so.property}`,
                  source: { section: "views", viewName: view.name },
                });
                continue;
              }
              sortSet.add(np);
              vc.sort = vc.sort ?? [];
              vc.sort.push({ property: np, direction: so.direction });
            }
          }
        }

        // summaries
        if (view.summaries !== undefined) {
          if (typeof view.summaries !== "object" || view.summaries === null) {
            diagnostics.push({
              code: "CFG002",
              severity: "error",
              message: `View '${view.name}' summaries must be an object`,
            });
          } else {
            const sums: Record<string, string> = {};
            for (const [k, v] of Object.entries(view.summaries)) {
              if (typeof v !== "string") {
                diagnostics.push({
                  code: "CFG002",
                  severity: "error",
                  message: `View '${view.name}' summary value must be a string`,
                });
                continue;
              }
              sums[normalizePropertyId(k)] = v;
            }
            vc.summaries = sums;
          }
        }

        // limit
        if (view.limit !== undefined) {
          if (
            typeof view.limit !== "number" || !Number.isInteger(view.limit) ||
            view.limit < 1
          ) {
            diagnostics.push({
              code: "CFG002",
              severity: "error",
              message: `View '${view.name}' limit must be a positive integer`,
            });
          } else {
            vc.limit = view.limit;
          }
        }

        // Copy unknown view-specific keys (preserve on round-trip)
        for (const [k, v] of Object.entries(view)) {
          if (
            ![
              "type",
              "name",
              "filters",
              "groupBy",
              "order",
              "sort",
              "summaries",
              "limit",
            ].includes(k)
          ) {
            vc[k] = v;
          }
        }

        config.views.push(vc);
      }
    }
  }

  // Copy x-* extensions
  for (const [k, v] of Object.entries(rawObj)) {
    if (k.startsWith("x-")) {
      (config as Record<string, unknown>)[k] = v;
    }
  }

  return { config: diagnostics.length === 0 ? config : config, diagnostics };
}

// ---------------------------------------------------------------------------
// Property ID normalization (§6.3)
// ---------------------------------------------------------------------------

export function normalizePropertyId(key: string): string {
  const dotIdx = key.indexOf(".");
  if (dotIdx < 0) {
    return `note.${key}`;
  }
  // Already namespaced (note.xxx, file.xxx, formula.xxx)
  return key;
}

// ---------------------------------------------------------------------------
// Filter node validation
// ---------------------------------------------------------------------------

function validateFilterNode(node: unknown, section: string): Diagnostic | null {
  if (typeof node === "string") return null;
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return {
      code: "CFG002",
      severity: "error",
      message: `Filter node in '${section}' must be a string or object`,
    };
  }
  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) =>
    k === "and" || k === "or" || k === "not"
  );
  if (keys.length === 0) {
    return {
      code: "CFG002",
      severity: "error",
      message: `Filter node in '${section}' must have and, or, or not`,
    };
  }
  if (keys.length > 1) {
    return {
      code: "CFG002",
      severity: "error",
      message:
        `Filter node in '${section}' must have exactly one of and/or/not`,
    };
  }
  const key = keys[0];
  const children = obj[key];
  if (!Array.isArray(children)) {
    return {
      code: "CFG002",
      severity: "error",
      message: `Filter '${key}' must be an array`,
    };
  }
  // Recursively validate children
  for (const child of children) {
    const d = validateFilterNode(child, section);
    if (d) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Duplicate YAML key detection
// ---------------------------------------------------------------------------

function detectDuplicateTopLevelKeys(yamlText: string): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const line of yamlText.split("\n")) {
    // Top-level keys: start at column 0, not a comment, not a continuation
    if (/^\s/.test(line)) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("---") || line.startsWith("...")) continue;
    const m = line.match(/^([^:]+):\s/);
    if (m) {
      const key = m[1].trim();
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
  }
  return duplicates;
}
