import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { parseRecentDirectories, updateRecentDirectories } from "./recentDirectories.ts";

test("recent directories move reopened paths to the front and deduplicate separators", () => {
  let paths = updateRecentDirectories([], "C:\\Notes\\");
  paths = updateRecentDirectories(paths, "D:\\Research");
  paths = updateRecentDirectories(paths, "c:/notes");
  assertEquals(paths, ["c:/notes", "D:\\Research"]);
});

test("recent directories are bounded and tolerate invalid storage", () => {
  assertEquals(updateRecentDirectories(["b", "c"], "a", 2), ["a", "b"]);
  assertEquals(parseRecentDirectories("not json"), []);
  assertEquals(parseRecentDirectories(JSON.stringify(["a", 1, "b"])), ["a", "b"]);
});
