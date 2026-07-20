import { assertEquals } from "jsr:@std/assert";
import { displayFilePath } from "./WidgetSettingsPanel.tsx";

Deno.test("File Widget settings hide internal file scope prefixes", () => {
  assertEquals(
    displayFilePath("workspace://Notes/example.md", "C:\\Users\\me\\Files"),
    "Notes/example.md",
  );
  assertEquals(
    displayFilePath("files://Notes/example.md", "C:\\Users\\me\\Files"),
    "C:\\Users\\me\\Files\\Notes\\example.md",
  );
});
