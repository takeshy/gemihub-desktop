// Formula compiler — dependency graph, cycle detection, lazy evaluation with cache (§9.4, §17).

import type {
  AstNode,
  CompiledBase,
  CompiledFormula,
  Diagnostic,
  EvalContext,
  FormulaNamespace,
  RowScope,
  Value,
} from "./types";
import { ParseError, parseExpression } from "./parser";
import { LexError } from "./lexer";
import { evaluate } from "./evaluator";
import { errorVal } from "./types";
import { parseBaseConfig } from "./config";

export function compileFormulas(
  formulas: Record<string, string>,
  diagnostics: Diagnostic[],
): Map<string, CompiledFormula> {
  const compiled = new Map<string, CompiledFormula>();

  for (const [name, expr] of Object.entries(formulas)) {
    try {
      const ast = parseExpression(expr);
      const deps = collectFormulaRefs(ast);
      compiled.set(name, { name, expression: expr, ast, dependencies: deps });
    } catch (e) {
      const code = e instanceof LexError
        ? e.code
        : e instanceof ParseError
        ? e.code
        : "EVAL002";
      diagnostics.push({
        code,
        severity: "error",
        message: `Formula '${name}' parse error: ${(e as Error).message}`,
        source: { section: "formulas", key: name },
      });
    }
  }

  // Detect cycles (REF001)
  detectCycles(compiled, diagnostics);

  return compiled;
}

export function compileCustomSummaries(
  summaries: Record<string, string>,
  diagnostics: Diagnostic[],
): Map<string, CompiledFormula> {
  const compiled = new Map<string, CompiledFormula>();

  for (const [name, expr] of Object.entries(summaries)) {
    try {
      const ast = parseExpression(expr);
      compiled.set(name, {
        name,
        expression: expr,
        ast,
        dependencies: new Set(),
      });
    } catch (e) {
      const code = e instanceof LexError
        ? e.code
        : e instanceof ParseError
        ? e.code
        : "EVAL002";
      diagnostics.push({
        code,
        severity: "error",
        message: `Custom summary '${name}' parse error: ${
          (e as Error).message
        }`,
        source: { section: "summaries", key: name },
      });
    }
  }

  return compiled;
}

// ---------------------------------------------------------------------------
// Collect formula references from AST (§9.4)
// ---------------------------------------------------------------------------

export function collectFormulaRefs(ast: AstNode): Set<string> {
  const refs = new Set<string>();
  collectRefs(ast, refs);
  return refs;
}

function collectRefs(node: AstNode, refs: Set<string>): void {
  switch (node.kind) {
    case "literal":
      return;
    case "identifier":
      return;
    case "list":
      for (const e of node.elements) collectRefs(e, refs);
      return;
    case "unary":
      collectRefs(node.operand, refs);
      return;
    case "binary":
      collectRefs(node.left, refs);
      collectRefs(node.right, refs);
      return;
    case "member":
      // formula.<name>
      if (
        node.object.kind === "identifier" &&
        (node.object as { name: string }).name === "formula"
      ) {
        refs.add(node.property);
      } else {
        collectRefs(node.object, refs);
      }
      return;
    case "index":
      // formula["<name>"] or formula[<expr>]
      if (
        node.object.kind === "identifier" &&
        (node.object as { name: string }).name === "formula"
      ) {
        if (
          node.index.kind === "literal" && node.index.value.type === "string"
        ) {
          refs.add((node.index.value as { value: string }).value);
        }
        // Dynamic key — will be caught by REF003 during evaluation
      } else {
        collectRefs(node.object, refs);
        collectRefs(node.index, refs);
      }
      return;
    case "call":
      collectRefs(node.callee, refs);
      for (const a of node.args) collectRefs(a, refs);
      return;
  }
}

// ---------------------------------------------------------------------------
// Cycle detection (REF001)
// ---------------------------------------------------------------------------

export function detectCycles(
  compiled: Map<string, CompiledFormula>,
  diagnostics: Diagnostic[],
): void {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const name of compiled.keys()) color.set(name, WHITE);

  function dfs(name: string, path: string[]): boolean {
    color.set(name, GRAY);
    path.push(name);
    const formula = compiled.get(name);
    if (formula) {
      for (const dep of formula.dependencies) {
        if (!compiled.has(dep)) continue; // dependency doesn't exist — will be null
        const c = color.get(dep);
        if (c === GRAY) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          const cycle = path.slice(cycleStart).concat(dep);
          diagnostics.push({
            code: "REF001",
            severity: "error",
            message: `Formula cycle: ${cycle.join(" -> ")}`,
            source: { section: "formulas", key: name },
          });
          return true;
        }
        if (c === WHITE) {
          if (dfs(dep, path)) return true;
        }
      }
    }
    path.pop();
    color.set(name, BLACK);
    return false;
  }

  for (const name of compiled.keys()) {
    if (color.get(name) === WHITE) {
      dfs(name, []);
    }
  }
}

// ---------------------------------------------------------------------------
// Formula evaluation with cache (§17)
// ---------------------------------------------------------------------------

export function createFormulaNamespace(
  compiled: Map<string, CompiledFormula>,
  ctx: EvalContext,
  rowScope: RowScope,
): FormulaNamespace {
  const names = [...compiled.keys()];

  function resolve(name: string): Value | undefined {
    const formula = compiled.get(name);
    if (!formula) return undefined;

    // Check cache
    if (ctx.formulaCache) {
      const cached = ctx.formulaCache.get(name);
      if (cached !== undefined) return cached;
    }

    // Check for re-entrance (compile-time cycle that was missed)
    if (ctx.evaluatingFormulas?.has(name)) {
      const err = errorVal(
        "REF001",
        `Formula cycle detected at runtime: ${name}`,
      );
      if (ctx.formulaCache) ctx.formulaCache.set(name, err);
      return err;
    }

    ctx.evaluatingFormulas?.add(name);

    const formulaCtx: EvalContext = {
      ...ctx,
      rowScope,
      locals: undefined,
      summaryValues: undefined,
    };

    const result = evaluate(formula.ast, formulaCtx);

    ctx.evaluatingFormulas?.delete(name);

    if (ctx.formulaCache) ctx.formulaCache.set(name, result);
    return result;
  }

  return { names, resolve };
}

// ---------------------------------------------------------------------------
// Compile base (full compilation pipeline)
// ---------------------------------------------------------------------------

export function compileBase(yamlText: string): CompiledBase {
  const { config, diagnostics } = parseBaseConfig(yamlText);

  const formulas = new Map<string, CompiledFormula>();
  const customSummaries = new Map<string, CompiledFormula>();

  if (config) {
    // Compile formulas
    for (const [name, expr] of Object.entries(config.formulas)) {
      try {
        const ast = parseExpression(expr);
        const deps = collectFormulaRefs(ast);
        formulas.set(name, { name, expression: expr, ast, dependencies: deps });
      } catch (e) {
        const code = e instanceof LexError
          ? e.code
          : e instanceof ParseError
          ? e.code
          : "EVAL002";
        diagnostics.push({
          code,
          severity: "error",
          message: `Formula '${name}' parse error: ${(e as Error).message}`,
          source: { section: "formulas", key: name },
        });
      }
    }

    // Detect formula cycles
    detectCycles(formulas, diagnostics);

    // Compile custom summaries
    for (const [name, expr] of Object.entries(config.summaries)) {
      try {
        const ast = parseExpression(expr);
        customSummaries.set(name, {
          name,
          expression: expr,
          ast,
          dependencies: new Set(),
        });
      } catch (e) {
        const code = e instanceof LexError
          ? e.code
          : e instanceof ParseError
          ? e.code
          : "EVAL002";
        diagnostics.push({
          code,
          severity: "error",
          message: `Custom summary '${name}' parse error: ${
            (e as Error).message
          }`,
          source: { section: "summaries", key: name },
        });
      }
    }
  }

  return {
    profile: "OBX-2026-06",
    config: config ??
      { formulas: {}, properties: {}, summaries: {}, views: [] },
    formulas,
    customSummaries,
    diagnostics,
  };
}
