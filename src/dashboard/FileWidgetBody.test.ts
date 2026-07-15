import { assertEquals } from "jsr:@std/assert";
import { docKindFor } from "./documentKind.ts";

Deno.test("File widgets route .base files to the Base editor", () => {
  assertEquals(docKindFor("Dashboards/Bases/Projects.base"), "base");
  assertEquals(docKindFor("NOTES.BASE"), "base");
});

Deno.test("File widgets route .kanban files to the Kanban editor", () => {
  assertEquals(docKindFor("Dashboards/Kanbans/Tasks.kanban"), "kanban");
  assertEquals(docKindFor("BOARD.KANBAN"), "kanban");
});

Deno.test("File widgets route .canvas files to the visual Canvas editor", () => {
  assertEquals(docKindFor("Boards/Planning.canvas"), "canvas");
  assertEquals(docKindFor("MAP.CANVAS"), "canvas");
});
