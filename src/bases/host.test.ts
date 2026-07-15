import assert from "node:assert/strict";
import test from "node:test";

import { compileBase } from "./formula";
import { createGemiHubHost } from "./host";
import { queryView, resolveProperty } from "./query";
import { valueToString } from "./values";

test("GemiHub host exposes markdown frontmatter dates to Bases queries", () => {
  const base = compileBase(`
views:
  - type: table
    name: Dates
    filters: due > date("2025-01-01")
    order:
      - file.name
      - due
`);
  const { host, snapshot } = createGemiHubHost({
    files: [
      {
        id: "a",
        name: "A.md",
        mimeType: "text/markdown",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        content: "---\ndue: 2025-02-28\n---\n# A\n",
      },
      {
        id: "b",
        name: "B.md",
        mimeType: "text/markdown",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        content: "---\ndue: 2024-12-31\n---\n# B\n",
      },
    ],
  }, Date.UTC(2025, 0, 1));

  const result = queryView(base, "Dates", host, snapshot);

  assert.deepEqual(result.data.map((entry) => entry.file.path), ["A.md"]);
  assert.equal(
    resolveProperty(result.data[0], "note.due", host, snapshot, []).type,
    "date",
  );
});

test("GemiHub host resolves forward wikilinks after all files are indexed", () => {
  const { host } = createGemiHubHost({
    files: [
      {
        id: "a",
        name: "A.md",
        mimeType: "text/markdown",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        content: "[[B]]",
      },
      {
        id: "b",
        name: "B.md",
        mimeType: "text/markdown",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        content: "# B",
      },
    ],
  });

  const file = host.getFile("A.md");
  assert.ok(file);
  assert.deepEqual(host.getOutgoingLinks(file), [{
    target: "B",
    resolvedPath: "B.md",
  }]);
});

test("GemiHub host does not expose note properties for non-markdown files", () => {
  const base = compileBase(`
views:
  - type: table
    name: All
    order:
      - file.name
      - note.title
`);
  const { host, snapshot } = createGemiHubHost({
    files: [
      {
        id: "json",
        name: "data.json",
        mimeType: "application/json",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        content: '{"title":"JSON title"}',
      },
    ],
  });

  const result = queryView(base, "All", host, snapshot);

  assert.equal(result.data.length, 1);
  assert.equal(
    valueToString(
      resolveProperty(result.data[0], "note.title", host, snapshot, []),
    ),
    "",
  );
});

test("bare property reference resolves even when it shares a global function name", () => {
  // Regression: `image(image)` — the inner bare `image` must resolve to the
  // note property `image`, not be shadowed by the image() function name.
  const base = compileBase(`
filters:
  and:
    - file.inFolder("cooking")
    - image != null
formulas:
  cover: image(image)
views:
  - type: cards
    name: Cooking
    order:
      - file.name
`);
  const { host, snapshot } = createGemiHubHost({
    files: [
      {
        id: "a",
        name: "cooking/Curry.md",
        mimeType: "text/markdown",
        modifiedTime: "2025-01-01T00:00:00.000Z",
        content: "---\nimage: cooking/curry.png\n---\n# Curry\n",
      },
      {
        id: "img",
        name: "cooking/curry.png",
        mimeType: "image/png",
        modifiedTime: "2025-01-01T00:00:00.000Z",
      },
    ],
  });

  const result = queryView(base, "Cooking", host, snapshot);

  // The `image != null` filter keeps the note (bare `image` must be the property).
  assert.deepEqual(result.data.map((e) => e.file.path), ["cooking/Curry.md"]);

  // The formula resolves to an image value pointing at the resolved file.
  const cover = resolveProperty(
    result.data[0],
    "formula.cover",
    host,
    snapshot,
    [],
  );
  assert.equal(cover.type, "image");
  if (cover.type === "image") {
    assert.equal(cover.source, "cooking/curry.png");
    assert.equal(cover.resolvedPath, "cooking/curry.png");
  }
});
