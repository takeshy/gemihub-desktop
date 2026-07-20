import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { closestSide, parseCanvas, serializeCanvas } from "./model.ts";

Deno.test("JSON Canvasを解析して不明な接続を除外する", () => {
  const result = parseCanvas(JSON.stringify({
    nodes: [{
      id: "a",
      type: "text",
      x: 1,
      y: 2,
      width: 200,
      height: 100,
      text: "hello",
    }],
    edges: [{ id: "ok", fromNode: "a", toNode: "a", toEnd: "arrow" }, {
      id: "bad",
      fromNode: "a",
      toNode: "missing",
    }],
  }));
  assertEquals(result.error, "");
  assertEquals(result.data.nodes[0].text, "hello");
  assertEquals(result.data.edges.map((edge) => edge.id), ["ok"]);
  assertStringIncludes(serializeCanvas(result.data), '"nodes"');
});

Deno.test("不正なCanvas JSONはエラーになる", () => {
  assertStringIncludes(parseCanvas("{").error, "Could not parse");
  assertStringIncludes(parseCanvas("{}").error, "nodes and edges");
});

Deno.test("ノード間の主要方向を選ぶ", () => {
  const a = {
    id: "a",
    type: "text" as const,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  assertEquals(closestSide(a, { ...a, id: "b", x: 300 }), "right");
  assertEquals(closestSide(a, { ...a, id: "c", y: -300 }), "top");
});
