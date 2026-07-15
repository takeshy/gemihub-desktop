import { assertEquals } from "jsr:@std/assert";
import { strToU8, zipSync } from "fflate";
import { checkGemihubOkfUpdate, installGemihubOkfUpdate } from "./gemihubOkfUpdate.ts";

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.test("managed GemiHub OKF update verifies and writes manifest last", async () => {
  const documents = { "index.md": strToU8("---\ntitle: GemiHub\n---\n# GemiHub\n"), "features/chat.md": strToU8("# Chat\n") };
  const archive = zipSync(documents);
  const manifest = {
    name: "GemiHub",
    version: "2.0.0",
    publishedAt: "2026-07-14T00:00:00Z",
    bundleUrl: "releases/2.0.0/gemihub-okf.zip",
    sha256: await sha256(archive),
    files: Object.fromEntries(await Promise.all(Object.entries(documents).map(async ([path, bytes]) => [path, await sha256(bytes)]))),
  };
  const writes: Array<[string, string]> = [];
  const host = globalThis as unknown as { window?: { go?: unknown } };
  const originalWindow = host.window;
  host.window = { go: { main: { App: {
    ExternalHTTPRequest: (request: { url: string }) => request.url.endsWith("manifest.json")
      ? Promise.resolve({ status: 200, headers: {}, body: JSON.stringify(manifest), bodyBase64: "" })
      : Promise.resolve({ status: 200, headers: {}, body: "", bodyBase64: base64(archive) }),
    ReadFile: () => Promise.resolve(null),
    WriteFile: (path: string, content: string) => { writes.push([path, content]); return Promise.resolve(); },
  } } } };
  try {
    const update = await checkGemihubOkfUpdate("https://updates.example/okf", "", "Knowledge", { id: "gemihub", name: "GemiHub" });
    if (!update) throw new Error("Expected an available update");
    await installGemihubOkfUpdate(update);
    assertEquals(writes.map(([path]) => path), [
      "Knowledge/gemihub/index.md",
      "Knowledge/gemihub/features/chat.md",
      "Knowledge/gemihub/manifest.json",
    ]);
    assertEquals(JSON.parse(writes.at(-1)?.[1] ?? "{}").version, "2.0.0");
  } finally {
    if (originalWindow) host.window = originalWindow;
    else delete host.window;
  }
});
