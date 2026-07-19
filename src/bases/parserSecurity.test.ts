import assert from "node:assert/strict";
import test from "node:test";
import { parseExpression } from "./parser.ts";

test("Bases rejects catastrophic regular expressions", () => {
  assert.throws(() => parseExpression("/(a+)+$/"), /Unsafe/);
  assert.throws(() => parseExpression("/(a|aa)+$/"), /Unsafe/);
  assert.throws(() => parseExpression("/a+a+$/"), /Unsafe/);
});

test("Bases rejects excessive expression nesting", () => {
  const expression = "(".repeat(129) + "true" + ")".repeat(129);
  assert.throws(() => parseExpression(expression), /nesting/);
});
