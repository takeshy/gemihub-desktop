import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { applyHostPatches } from "./hostPatches.ts";

Deno.test("host patches update, create, and delete files inside their root", () => {
  const patch = [
    "diff --git a/main.js b/main.js",
    "--- a/main.js",
    "+++ b/main.js",
    "@@ -1,1 +1,1 @@",
    "-original",
    "+workspace",
    "",
    "diff --git a/dev/null b/helper.js",
    "--- /dev/null",
    "+++ b/helper.js",
    "@@ -0,0 +1,1 @@",
    "+helper",
    "",
    "diff --git a/styles.css b/dev/null",
    "--- a/styles.css",
    "+++ /dev/null",
    "@@ -1,1 +0,0 @@",
    "-old",
    "",
  ].join("\n");
  const result = applyHostPatches(
    "demo",
    [
      { relativePath: "demo/main.js", content: "original\n" },
      { relativePath: "demo/styles.css", content: "old\n" },
      { relativePath: "demo/workspace.patch", content: patch },
    ],
    { hostPatches: { "gemihub-desktop": ["workspace.patch"] } },
    "gemihub-desktop",
  );
  assertEquals(result.error, undefined);
  assertEquals(result.applied, ["workspace.patch"]);
  assertEquals(
    result.files.find((file) => file.relativePath === "demo/main.js")?.content,
    "workspace\n",
  );
  assertEquals(
    result.files.find((file) => file.relativePath === "demo/helper.js")
      ?.content,
    "helper\n",
  );
  assertEquals(
    result.files.some((file) => file.relativePath === "demo/styles.css"),
    false,
  );
});

Deno.test("host patches reject traversal and protected targets without partial output", () => {
  const traversal =
    "--- a/main.js\n+++ b/../outside.js\n@@ -1,1 +1,1 @@\n-old\n+bad\n";
  const files = [{ relativePath: "demo/main.js", content: "old\n" }, {
    relativePath: "demo/x.patch",
    content: traversal,
  }];
  const result = applyHostPatches("demo", files, {
    hostPatches: { host: ["x.patch"] },
  }, "host");
  assertStringIncludes(result.error ?? "", "unsafe patch target");
  assertEquals(result.files, files);

  const manifestPatch =
    '--- a/manifest.json\n+++ b/manifest.json\n@@ -1,1 +1,1 @@\n-{}\n+{"changed":true}\n';
  const protectedResult = applyHostPatches(
    "demo",
    [
      { relativePath: "demo/manifest.json", content: "{}\n" },
      { relativePath: "demo/x.patch", content: manifestPatch },
    ],
    { hostPatches: { host: ["x.patch"] } },
    "host",
    { protectedPaths: ["manifest.json"] },
  );
  assertStringIncludes(protectedResult.error ?? "", "protected");
});
