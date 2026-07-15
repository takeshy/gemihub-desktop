import { assertEquals } from "jsr:@std/assert";
import { parseFrontmatter, replaceFrontmatterBody, serializeFrontmatter, type FrontmatterProperty } from "./FrontmatterEditor.tsx";

Deno.test("frontmatter parses YAML and preserves the markdown body", () => {
  const parsed = parseFrontmatter("---\ntitle: Note\ndate: 2026-07-12\ntags:\n  - one\n  - two\n---\n# Body\n");
  assertEquals(parsed.valid, true);
  assertEquals(parsed.frontmatter, { title: "Note", date: "2026-07-12", tags: ["one", "two"] });
  assertEquals(parsed.body, "# Body\n");
});

Deno.test("frontmatter serialization preserves types and body", () => {
  const properties: FrontmatterProperty[] = [
    { id: "1", key: "done", value: true, type: "checkbox" },
    { id: "2", key: "count", value: 4, type: "number" },
    { id: "3", key: "tags", value: ["a", "b"], type: "list" },
  ];
  const content = serializeFrontmatter(properties, "Text\n");
  const parsed = parseFrontmatter(content);
  assertEquals(parsed.frontmatter, { done: true, count: 4, tags: ["a", "b"] });
  assertEquals(parsed.body, "Text\n");
});

Deno.test("replacing WYSIWYG body keeps frontmatter", () => {
  const content = "---\ntitle: Note\n---\nOld\n";
  assertEquals(replaceFrontmatterBody(content, "New\n"), "---\ntitle: Note\n---\nNew\n");
});
