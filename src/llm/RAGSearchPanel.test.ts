import { assertEquals } from "jsr:@std/assert";
import { contentMatches, filterTerms } from "./ragSearchFilters.ts";

Deno.test("RAG search filters use OR within a row and AND between rows", () => {
  assertEquals(filterTerms('apple "red fruit" banana'), ["apple", "red fruit", "banana"]);
  assertEquals(contentMatches("A red fruit grows in an orchard", [
    { id: 1, value: 'apple "red fruit"' },
    { id: 2, value: "orchard farm" },
  ]), true);
  assertEquals(contentMatches("A red fruit grows in a basket", [
    { id: 1, value: 'apple "red fruit"' },
    { id: 2, value: "orchard farm" },
  ]), false);
});
