import { assertEquals } from "jsr:@std/assert";
import { displayFilePath } from "./WidgetSettingsPanel.tsx";

Deno.test("File Widget settings hide internal file scope prefixes", () => {
  assertEquals(
    displayFilePath("Notes/example.md", "C:\\Users\\me\\Files"),
    "Notes/example.md",
  );
  assertEquals(
    displayFilePath("C:\\Users\\me\\Files\\Notes\\example.md", "C:\\Users\\me\\Files"),
    "C:\\Users\\me\\Files\\Notes\\example.md",
  );
});
