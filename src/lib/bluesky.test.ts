import { test } from "vitest";
import assert from "node:assert/strict";
import { blueskyContent, blueskyPrefersImage, buildBlueskyPosts, splitBlueskyText, type BlueskyEntry } from "./bluesky";
const entry = (id: string, content = id, replyTo = ""): BlueskyEntry => ({ id, content, replyTo, createdAt: "2026-10-14T00:00:00.000Z", speaker: "user", authorName: "", sourcePath: "Timeline/day.md" });
const adapter = async () => ({ data: "eA==", mime: "image/jpeg", alt: "image" });
test("selection excludes unselected and late replies, orders parents first and supports reply-only selection", async () => {
  const entries = [entry("reply", "reply", "root"), entry("root"), entry("excluded", "private", "root")];
  const preview = await buildBlueskyPosts(entries, new Set(["root", "reply"]), adapter);
  assert.equal(preview.length, 2);
  assert.equal(preview[1].parent, preview[0].id);
  assert.equal((await buildBlueskyPosts(entries, new Set(["reply"]), adapter))[0].parent, "");
});
test("Japanese and multi-code-point emoji split into valid chained posts without breaking graphemes", async () => {
  const text = "あ".repeat(289) + "👨‍👩‍👧‍👦" + "続き";
  const preview = await buildBlueskyPosts([entry("long", text)], new Set(["long"]), adapter);
  assert.equal(preview.length, 2);
  assert.equal(preview[0].text, "あ".repeat(289) + "👨‍👩‍👧‍👦");
  assert.equal(preview[1].parent, preview[0].id);
  assert.equal(preview.map(post => post.text).join(""), text);
});
test("selected images are prepared once and shown only on the first split post", async () => {
  const preview = await buildBlueskyPosts([entry("image", `![[picture.png]]\n${"a".repeat(400)}`)], new Set(["image"]), adapter);
  assert.equal(preview[0].images?.length, 1);
  assert.equal(preview[1].images, undefined);
  assert.ok(!preview[0].text.includes("picture.png"));
});
test("cyclic replies and excessive image counts cannot reach publication", async () => {
  await assert.rejects(buildBlueskyPosts([entry("a", "a", "b"), entry("b", "b", "a")], new Set(["a", "b"]), adapter));
  await assert.rejects(buildBlueskyPosts([entry("a", "![[a.png]]".repeat(5))], new Set(["a"]), adapter));
});

test("omitted intermediate replies attach to their nearest selected ancestor", async () => {
  const entries = [entry("root"), entry("middle", "private", "root"), entry("leaf", "public", "middle")];
  const preview = await buildBlueskyPosts(entries, new Set(["root", "leaf"]), adapter);
  assert.equal(preview[1].parent, preview[0].id);
  assert.ok(preview.every(post => post.text !== "private"));
});

test("Timeline markup is removed and only Workspace images become attachments", () => {
  const source = [
    "<!-- calendar-event: 2026-10-14 -->",
    "> [!calendar] Calendar event · 2026-10-14",
    "> **Dinner** with [[People/Alice|Alice]] @ai",
    "![[Meeting.md]] ![remote](https://example.com/a.png) ![](<my%20pic.png> \"title\") ![[/assets/x.png|alt text]]",
    "[docs](https://example.com/docs) and `code`",
  ].join("\n");
  const { text, images } = blueskyContent(source, "Timeline/day.md");
  assert.equal(text, "Calendar event · 2026-10-14\nDinner with Alice\nMeeting remote https://example.com/a.png\ndocs https://example.com/docs and code");
  assert.equal(images.length, 2);
  assert.ok(images[0].candidates.includes("Timeline/my pic.png"));
  assert.ok(images[1].candidates.includes("assets/x.png"));
  assert.equal(images[1].alt, "alt text");
});

test("splitting prefers whitespace and keeps URLs whole", () => {
  const url = "https://example.com/" + "p".repeat(40);
  const text = "a".repeat(270) + " " + url + " end";
  const chunks = splitBlueskyText(text);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], "a".repeat(270));
  assert.ok(chunks[1].startsWith(url));
  assert.ok(chunks.every(chunk => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(chunk)].length <= 290));
});

test("image-format entries publish their pictures with only the links as text", async () => {
  const page = { data: "eA==", mime: "image/jpeg", alt: "page" };
  const source = entry("table", "| a | b |\n|---|---|\n| 1 | 2 |\nSee https://example.com/x");
  const preview = await buildBlueskyPosts([source], new Set(["table"]), adapter, { ids: new Set(["table"]), render: async () => [page, page, page, page, page] });
  assert.equal(preview.length, 2);
  assert.equal(preview[0].text, "https://example.com/x");
  assert.equal(preview[0].images?.length, 4);
  assert.equal(preview[1].images?.length, 1);
  assert.equal(preview[1].parent, preview[0].id);
});

test("a failed picture falls back to text, and code or tables prefer pictures", async () => {
  const preview = await buildBlueskyPosts([entry("a", "plain")], new Set(["a"]), adapter, { ids: new Set(["a"]), render: async () => null });
  assert.equal(preview[0].text, "plain");
  assert.equal(blueskyPrefersImage("```js\nx\n```"), true);
  assert.equal(blueskyPrefersImage("> [!calendar] Calendar event"), false);
  assert.equal(blueskyPrefersImage("plain"), false);
});
