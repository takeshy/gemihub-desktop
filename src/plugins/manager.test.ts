import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert";
import {
  installPluginRelease,
  normalizePluginRepo,
  pluginRecommendation,
  previewPluginRelease,
} from "./manager.ts";

function pluginManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "demo",
    name: "Demo",
    version: "0.1.0",
    minAppVersion: "0.1.0",
    description: "Demo plugin",
    author: "Test",
    permissions: ["files"],
    hostPatches: { "gemihub-desktop": ["patches/workspace.patch"] },
    ...overrides,
  });
}

function mockRuntime(manifest = pluginManifest()) {
  const installed: Array<
    { id: string; files: Record<string, string>; metadata: string }
  > = [];
  const assets = [
    {
      name: "manifest.json",
      browser_download_url: "https://downloads.example/manifest.json",
    },
    {
      name: "main.js",
      browser_download_url: "https://downloads.example/main.js",
    },
    {
      name: "workspace.patch",
      browser_download_url: "https://downloads.example/workspace.patch",
    },
  ];
  const patch =
    "--- a/main.js\n+++ b/main.js\n@@ -1,1 +1,1 @@\n-original\n+workspace\n";
  const backend = {
    ExternalHTTPRequest: ({ url }: { url: string }) =>
      Promise.resolve({
        status: 200,
        headers: {},
        bodyBase64: "",
        body: url.includes("/releases/latest")
          ? JSON.stringify({ tag_name: "v0.1.0", assets })
          : url.endsWith("manifest.json")
          ? manifest
          : url.endsWith("workspace.patch")
          ? patch
          : "original\n",
      }),
    InstallPluginFiles: (
      id: string,
      files: Record<string, string>,
      metadata: string,
    ) => {
      installed.push({ id, files, metadata });
      return Promise.resolve();
    },
  };
  return { backend, installed };
}

Deno.test("plugin release install validates and applies the workspace patch", async () => {
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previous = runtime.window;
  const mock = mockRuntime();
  runtime.window = { go: { main: { App: mock.backend } } };
  try {
    const preview = await previewPluginRelease("https://github.com/owner/repo");
    assertEquals(preview.manifest.id, "demo");
    const result = await installPluginRelease("owner/repo", undefined, preview);
    assertEquals(result.config.enabled, false);
    assertEquals(result.config.source, "github");
    assertEquals(mock.installed[0].files["main.js"], "workspace\n");
    assertEquals("patches/workspace.patch" in mock.installed[0].files, false);
    assertEquals(
      JSON.parse(mock.installed[0].metadata).patches[0].name,
      "patches/workspace.patch",
    );
    assertEquals(
      JSON.parse(mock.installed[0].metadata).patches[0].sha256.length,
      64,
    );
  } finally {
    runtime.window = previous;
  }
});

Deno.test("plugin repository input accepts supported GitHub forms only", () => {
  assertEquals(normalizePluginRepo("owner/repo"), "owner/repo");
  assertEquals(
    normalizePluginRepo("https://github.com/owner/repo.git/"),
    "owner/repo",
  );
  assertEquals(normalizePluginRepo("http://github.com/owner/repo"), null);
  assertEquals(
    normalizePluginRepo("https://github.com/owner/repo/issues"),
    null,
  );
  assertEquals(
    normalizePluginRepo("https://github.com/owner/repo?tab=readme"),
    null,
  );
});

Deno.test("plugin recommendation trusts only official and local provenance", () => {
  assertEquals(pluginRecommendation(), "custom");
  assertEquals(
    pluginRecommendation({ source: "local" }),
    "custom",
  );
  assertEquals(
    pluginRecommendation({ source: "github", repo: "takeshy/example" }),
    "official",
  );
  assertEquals(
    pluginRecommendation({ source: "github", repo: "TAKESHY/example" }),
    "official",
  );
  assertEquals(
    pluginRecommendation({ source: "github", repo: "someone/example" }),
    "third-party",
  );
});

Deno.test("plugin install rejects a release changed after permission preview", async () => {
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previous = runtime.window;
  const previewRuntime = mockRuntime();
  runtime.window = { go: { main: { App: previewRuntime.backend } } };
  try {
    const preview = await previewPluginRelease("owner/repo");
    const changedRuntime = mockRuntime(
      pluginManifest({ permissions: ["files", "network"] }),
    );
    runtime.window = { go: { main: { App: changedRuntime.backend } } };
    const error = await assertRejects(() =>
      installPluginRelease("owner/repo", undefined, preview)
    );
    assertStringIncludes(
      error instanceof Error ? error.message : String(error),
      "changed after preview",
    );
    assertEquals(changedRuntime.installed.length, 0);
  } finally {
    runtime.window = previous;
  }
});

Deno.test("plugin release rejects incompatible hosts and tag mismatches", async () => {
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previous = runtime.window;
  try {
    const incompatible = mockRuntime(
      pluginManifest({ minAppVersion: "9.0.0" }),
    );
    runtime.window = { go: { main: { App: incompatible.backend } } };
    const hostError = await assertRejects(() =>
      previewPluginRelease("owner/repo")
    );
    assertStringIncludes(
      hostError instanceof Error ? hostError.message : String(hostError),
      "requires",
    );

    const mismatch = mockRuntime(pluginManifest({ version: "0.2.0" }));
    runtime.window = { go: { main: { App: mismatch.backend } } };
    const tagError = await assertRejects(() =>
      previewPluginRelease("owner/repo")
    );
    assertStringIncludes(
      tagError instanceof Error ? tagError.message : String(tagError),
      "do not match",
    );

    const unsafePatch = mockRuntime(
      pluginManifest({
        hostPatches: { "gemihub-desktop": ["../workspace.patch"] },
      }),
    );
    runtime.window = { go: { main: { App: unsafePatch.backend } } };
    const patchError = await assertRejects(() =>
      previewPluginRelease("owner/repo")
    );
    assertStringIncludes(
      patchError instanceof Error ? patchError.message : String(patchError),
      "hostPatches",
    );
  } finally {
    runtime.window = previous;
  }
});
