import { assertEquals } from "jsr:@std/assert";
import { findTextMatchStarts } from "./textAnchor.ts";

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
