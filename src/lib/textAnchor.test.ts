import { assertEquals } from "jsr:@std/assert";
import { buildTextIndex, findTextMatchStarts } from "./textAnchor.ts";

Deno.test("file search finds every case-insensitive non-overlapping match", () => {
  assertEquals(findTextMatchStarts("Alpha beta ALPHA alphabet", "alpha"), [
    0,
    11,
    17,
  ]);
});

Deno.test("file search handles Japanese text and empty queries", () => {
  assertEquals(findTextMatchStarts("検索できます。再検索します。", "検索"), [
    0,
    8,
  ]);
  assertEquals(findTextMatchStarts("content", "   "), []);
});

Deno.test("rendered block boundaries separate headings from body text", () => {
  const root = { parentElement: null };
  const heading = { tagName: "H2", parentElement: root };
  const paragraph = { tagName: "P", parentElement: root };
  const nodes = [
    { data: "見出し", parentElement: heading },
    { data: "本文", parentElement: paragraph },
  ];
  let index = 0;
  const document = {
    createTreeWalker: () => ({
      nextNode: () => nodes[index++] ?? null,
    }),
  };
  Object.assign(root, { ownerDocument: document });

  assertEquals(buildTextIndex(root as unknown as Node).text, "見出し 本文");
});

Deno.test("PDF text-layer line breaks separate adjacent text spans", () => {
  const root = { parentElement: null };
  const nodes = [
    { nodeType: 3, data: "models that excel at", parentElement: root },
    { nodeType: 1, tagName: "BR", parentElement: root },
    { nodeType: 3, data: "passive tasks", parentElement: root },
  ];
  let index = 0;
  const document = {
    createTreeWalker: () => ({
      nextNode: () => nodes[index++] ?? null,
    }),
  };
  Object.assign(root, { ownerDocument: document });

  assertEquals(
    buildTextIndex(root as unknown as Node).text,
    "models that excel at passive tasks",
  );
});
