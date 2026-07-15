import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildOkfSystemPrompt,
  discoverOkfBundles,
  fetchOkfDocument,
  getBuiltinOkfBundle,
  okfDocumentTool,
} from "./okf.ts";
import { BUILTIN_OKF_BUNDLE_ID } from "./builtinOkf.ts";

const files = new Map<string, string>([
  ["Knowledge/product/index.md", "---\ntitle: Product Handbook\ntags:\n  * product\n---\nBundle overview."],
  ["Knowledge/product/concepts/widget.md", "---\ntitle: Widget\ntype: Concept\ndescription: The core object\ntags: object, core\n---\n# Widget\n\nA widget belongs to a project.\n\n- one\n- two"],
  ["Knowledge/product/concepts/index.md", "# Concepts"],
  ["Knowledge/product/log.md", "Internal release history that must not be injected."],
  ["Knowledge/operations/index.md", "---\ntitle: Operations\n---\nOperations overview."],
]);

const scope = globalThis as unknown as {
  go?: unknown;
  window?: { go?: unknown };
};

async function withFakeBackend<T>(run: () => Promise<T>): Promise<T> {
  const originalWindow = scope.window;
  scope.window = {
    ...(originalWindow ?? {}),
    main: {
      App: {},
    },
  } as unknown as { go?: unknown };
  scope.window.go = {
    main: { App: {
      FileInventory: () => Promise.resolve([...files.keys()].map((path) => ({
        path,
        size: files.get(path)?.length ?? 0,
        createdTime: 0,
        modTime: 0,
        md5: "",
        binary: false,
      }))),
      ReadFile: (path: string) => Promise.resolve(files.has(path) ? {
        path,
        fileName: path.split("/").pop() ?? path,
        content: files.get(path) ?? "",
      } : null),
    } },
  };
  try {
    return await run();
  } finally {
    if (originalWindow) scope.window = originalWindow;
    else delete scope.window;
  }
}

const fakeBuiltinDocs = [
  {
    path: "index.md",
    type: "Index",
    title: "GemiHub Desktop Help",
    description: "Feature guide index.",
    tags: [],
    body: "Overview. See features/ai-chat.md for AI Chat details.",
  },
  {
    path: "features/ai-chat.md",
    type: "Product Feature",
    title: "AI Chat",
    description: "Built-in product help.",
    tags: ["ai", "chat"],
    body: "Enable AI features in Settings.",
  },
];

Deno.test({
  name: "OKF discovers only top-level bundles and uses index titles",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await withFakeBackend(async () => {
      assertEquals(await discoverOkfBundles("Knowledge"), [
        { id: "operations", name: "Operations" },
        { id: "product", name: "Product Handbook" },
      ]);
    });
  },
});

Deno.test("built-in OKF is available without an external root", async () => {
  assertEquals(getBuiltinOkfBundle(), {
    id: BUILTIN_OKF_BUNDLE_ID,
    name: "GemiHub Desktop Help",
    builtin: true,
  });
  const prompt = await buildOkfSystemPrompt(
    "",
    [BUILTIN_OKF_BUNDLE_ID],
    () => Promise.resolve(fakeBuiltinDocs),
  );
  assertStringIncludes(prompt, `## OKF bundle: GemiHub Desktop Help (bundleId=${BUILTIN_OKF_BUNDLE_ID})`);
  assertStringIncludes(prompt, "Feature guide index.");
  assertStringIncludes(prompt, "See features/ai-chat.md for AI Chat details.");
  // Only the index is inlined; other documents are fetched on demand.
  assert(!prompt.includes("Enable AI features in Settings."));
  assertStringIncludes(prompt, "read_okf_document");
});

Deno.test({
  name: "OKF prompt inlines only the bundle index and excludes logs/other docs",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await withFakeBackend(async () => {
      const prompt = await buildOkfSystemPrompt("Knowledge", ["product"]);
      assertStringIncludes(prompt, "## OKF bundle: Product Handbook (bundleId=product)");
      assertStringIncludes(prompt, "Bundle overview.");
      assert(!prompt.includes("Internal release history"));
      assert(!prompt.includes("Operations overview"));
      // Concept documents are no longer eagerly inlined; only the index is.
      assert(!prompt.includes("A widget belongs to a project."));
    });
  },
});

Deno.test("okfDocumentTool is only offered when a bundle is active", () => {
  assertEquals(okfDocumentTool([]), []);
  const tools = okfDocumentTool(["product"]);
  assertEquals(tools.length, 1);
  assertEquals(tools[0].name, "read_okf_document");
});

Deno.test("fetchOkfDocument resolves built-in and external documents on demand", async () => {
  const builtinDoc = await fetchOkfDocument(
    "",
    BUILTIN_OKF_BUNDLE_ID,
    "features/ai-chat.md",
    [BUILTIN_OKF_BUNDLE_ID],
    () => Promise.resolve(fakeBuiltinDocs),
  );
  assertEquals(builtinDoc?.title, "AI Chat");
  assertStringIncludes(builtinDoc?.body ?? "", "Enable AI features in Settings.");

  await withFakeBackend(async () => {
    const externalDoc = await fetchOkfDocument("Knowledge", "product", "concepts/widget.md", ["product"]);
    assertEquals(externalDoc?.title, "Widget");
    // Markdown structure (headings, blank lines, list markers) must survive —
    // collapsing whitespace would turn this into one unreadable line.
    assertEquals(externalDoc?.body, "# Widget\n\nA widget belongs to a project.\n\n- one\n- two");

    // Leading slashes (as they'd appear in Markdown links) are tolerated.
    const withSlash = await fetchOkfDocument("Knowledge", "product", "/concepts/widget.md", ["product"]);
    assertEquals(withSlash?.title, "Widget");

    // log.md is never servable, even by explicit path.
    assertEquals(await fetchOkfDocument("Knowledge", "product", "log.md", ["product"]), null);

    // Unknown document/bundle resolves to null rather than throwing.
    assertEquals(await fetchOkfDocument("Knowledge", "product", "missing.md", ["product"]), null);

    // A document that exists is still rejected if its bundle isn't active —
    // a bundleId must come from the caller's own active-bundle list, not
    // merely from an argument the model happens to supply.
    assertEquals(await fetchOkfDocument("Knowledge", "product", "concepts/widget.md", ["operations"]), null);
    assertEquals(await fetchOkfDocument("Knowledge", "product", "concepts/widget.md", []), null);
  });
});
