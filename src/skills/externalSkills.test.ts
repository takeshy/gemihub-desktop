import { assertEquals } from "jsr:@std/assert";
import {
  compareVersions,
  fetchSkillCatalog,
  getSafeSkillTargetPath,
  installSkillFiles,
} from "./externalSkills.ts";

Deno.test("external skill semver and paths follow the catalog contract", () => {
  assertEquals((compareVersions("1.0.0", "1.0.0-beta") ?? 0) > 0, true);
  assertEquals(compareVersions("1.0", "1.0.0"), null);
  assertEquals(
    getSafeSkillTargetPath("review", "review/SKILL.md"),
    "skills/review/SKILL.md",
  );
  assertEquals(getSafeSkillTargetPath("review", "review/../escape.md"), null);
});

Deno.test("official catalog accepts the shared GemiHub compatibility baseline", async () => {
  const runtime = globalThis as unknown as {
    window?: { go?: { main: { App: Record<string, unknown> } } };
  };
  const previousWindow = runtime.window;
  runtime.window = {
    go: {
      main: {
        App: {
          ExternalHTTPRequest: (request: { url: string }) => {
            const body = request.url.endsWith("/takeshy/llm-hub-skills")
              ? JSON.stringify({ default_branch: "main" })
              : request.url.includes("/git/trees/")
              ? JSON.stringify({
                tree: [{ type: "blob", path: "skills/okf/manifest.json" }],
              })
              : JSON.stringify({
                id: "okf",
                name: "OKF",
                version: "0.1.2",
                description: "Author OKF",
                compatibility: {
                  plugins: [{ id: "gemihub", minVersion: "0.24.0" }],
                },
              });
            return Promise.resolve({
              status: 200,
              headers: {},
              body,
              bodyBase64: "",
            });
          },
        },
      },
    },
  };
  try {
    assertEquals(await fetchSkillCatalog(), [{
      id: "okf",
      name: "OKF",
      version: "0.1.2",
      description: "Author OKF",
    }]);
  } finally {
    runtime.window = previousWindow;
  }
});

Deno.test("external skills apply workspace host patches before installation", async () => {
  const writes: Array<[string, string]> = [];
  const backend = {
    CreateWorkspaceDirectory: async () => undefined,
    ReadWorkspaceFile: async () => null,
    WriteWorkspaceFile: async (path: string, content: string) => {
      writes.push([path, content]);
    },
  };
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previousWindow = runtime.window;
  runtime.window = { go: { main: { App: backend } } };
  try {
    const manifest = JSON.stringify({
      id: "patched",
      version: "1.0.0",
      compatibility: { plugins: [{ id: "gemihub-desktop" }] },
      hostPatches: { "gemihub-desktop": ["patches/workspace.patch"] },
    });
    const patch =
      "--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1,1 +1,1 @@\n-original\n+workspace\n";
    const result = await installSkillFiles([
      { relativePath: "patched/SKILL.md", content: "original\n" },
      { relativePath: "patched/manifest.json", content: manifest },
      { relativePath: "patched/patches/workspace.patch", content: patch },
    ], ["patched"]);
    assertEquals(result.installed, ["patched"]);
    assertEquals(
      writes.find(([path]) => path === "skills/patched/SKILL.md")?.[1],
      "workspace\n",
    );
  } finally {
    runtime.window = previousWindow;
  }
});

Deno.test("external skill installer validates manifests and confines writes", async () => {
  const writes = new Map<string, string>();
  const runtime = globalThis as unknown as {
    window?: { go?: { main: { App: Record<string, unknown> } } };
  };
  const previousWindow = runtime.window;
  runtime.window = previousWindow ?? {};
  const target = runtime.window;
  const previous = target.go;
  target.go = {
    main: {
      App: {
        CreateWorkspaceDirectory: () => Promise.resolve(),
        ReadWorkspaceFile: () => Promise.resolve(null),
        WriteWorkspaceFile: (path: string, content: string) => {
          writes.set(path, content);
          return Promise.resolve();
        },
      },
    },
  };
  try {
    const result = await installSkillFiles([
      { relativePath: "review/SKILL.md", content: "---\nname: Review\n---\n" },
      {
        relativePath: "review/manifest.json",
        content: JSON.stringify({
          id: "review",
          name: "Review",
          version: "1.0.0",
          compatibility: { plugins: [{ id: "llm-hub" }] },
        }),
      },
      {
        relativePath: "review/references/checklist.md",
        content: "Check tests",
      },
    ], ["review"]);
    assertEquals(result.installed, ["review"]);
    assertEquals([...writes.keys()].sort(), [
      "skills/review/SKILL.md",
      "skills/review/manifest.json",
      "skills/review/references/checklist.md",
    ]);

    const unsafe = await installSkillFiles([
      { relativePath: "bad/SKILL.md", content: "skill" },
      {
        relativePath: "bad/manifest.json",
        content: JSON.stringify({ id: "bad", version: "1.0.0" }),
      },
      { relativePath: "bad/../escape.md", content: "no" },
    ], ["bad"]);
    assertEquals(unsafe.installed, []);
    assertEquals(unsafe.skipped[0].reason.startsWith("unsafe path"), true);
  } finally {
    target.go = previous;
    runtime.window = previousWindow;
  }
});
