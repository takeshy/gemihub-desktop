export type WorkflowVariables = Map<string, string | number>;

function normalizeLegacyName(name: string): string {
  return name.startsWith("__") && name.endsWith("__") && name.length > 4
    ? `_${name.slice(2, -2)}`
    : name;
}

function legacyName(name: string): string {
  return name.startsWith("_") && !name.startsWith("__") && name.length > 1
    ? `__${name.slice(1)}__`
    : name;
}

export function getWorkflowVariable(
  variables: WorkflowVariables,
  name: string,
): string | number | undefined {
  const direct = variables.get(name);
  if (direct !== undefined) return direct;
  const normalized = normalizeLegacyName(name);
  if (normalized !== name && variables.has(normalized)) {
    return variables.get(normalized);
  }
  const legacy = legacyName(name);
  return legacy !== name ? variables.get(legacy) : undefined;
}

function nestedValue(
  value: unknown,
  path: string[],
  variables: WorkflowVariables,
): unknown {
  let current = value;
  for (const rawPart of path) {
    if (current === null || current === undefined) return undefined;
    const variableIndex = getWorkflowVariable(variables, rawPart);
    const index = variableIndex !== undefined ? String(variableIndex) : rawPart;
    current = (current as Record<string, unknown>)[index];
  }
  return current;
}

export function replaceWorkflowVariables(
  template: string,
  variables: WorkflowVariables,
): string {
  return template.replace(
    /\{\{([\w.[\]]+)(:json)?\}\}/g,
    (original, fullPath: string, jsonMode?: string) => {
      const [name, ...rest] = fullPath.match(/[^.[\]]+/g) ?? [];
      if (!name) return original;
      let value: unknown = getWorkflowVariable(variables, name);
      if (rest.length && typeof value === "string") {
        try {
          const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/);
          value = nestedValue(
            JSON.parse(fenced?.[1].trim() ?? value),
            rest,
            variables,
          );
        } catch {
          return original;
        }
      } else if (rest.length) value = nestedValue(value, rest, variables);
      if (value === undefined) return original;
      const text = typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
      return jsonMode ? JSON.stringify(text).slice(1, -1) : text;
    },
  );
}

export function evaluateWorkflowCondition(
  expression: string,
  variables: WorkflowVariables,
): boolean {
  const replaced = replaceWorkflowVariables(expression, variables).trim();
  const match = replaced.match(/^(.*?)\s*(==|!=|<=|>=|<|>|contains)\s*(.*?)$/);
  if (!match) throw new Error(`Invalid condition format: ${expression}`);
  const left = match[1].trim().replace(/^['"]|['"]$/g, "");
  const right = match[3].trim().replace(/^['"]|['"]$/g, "");
  const leftNumber = Number.parseFloat(left),
    rightNumber = Number.parseFloat(right);
  const numeric = !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber);
  switch (match[2]) {
    case "==":
      return numeric ? leftNumber === rightNumber : left === right;
    case "!=":
      return numeric ? leftNumber !== rightNumber : left !== right;
    case "contains": {
      try {
        const value = JSON.parse(left);
        if (Array.isArray(value)) return value.includes(right);
      } catch { /* use string containment */ }
      return left.includes(right);
    }
    case "<":
      return numeric ? leftNumber < rightNumber : left < right;
    case ">":
      return numeric ? leftNumber > rightNumber : left > right;
    case "<=":
      return numeric ? leftNumber <= rightNumber : left <= right;
    case ">=":
      return numeric ? leftNumber >= rightNumber : left >= right;
    default:
      return false;
  }
}

export function evaluateWorkflowValue(
  expression: string,
  variables: WorkflowVariables,
): string | number {
  const replaced = replaceWorkflowVariables(expression, variables);
  const arithmetic = replaced.match(
    /^(-?\d+(?:\.\d+)?)\s*([+*/%-])\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (arithmetic) {
    const left = Number(arithmetic[1]), right = Number(arithmetic[3]);
    if (arithmetic[2] === "+") return left + right;
    if (arithmetic[2] === "-") return left - right;
    if (arithmetic[2] === "*") return left * right;
    if (arithmetic[2] === "/") return right === 0 ? 0 : left / right;
    return left % right;
  }
  const number = Number(replaced);
  return replaced.trim() !== "" && Number.isFinite(number) ? number : replaced;
}
