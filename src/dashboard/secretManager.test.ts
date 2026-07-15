import { assertEquals } from "jsr:@std/assert";
import { decryptFileContent, encryptFileContent, encryptPrivateKey, generateKeyPair, getEncryptedFileMetadata, reencryptFileContent } from "../lib/hybridEncryption.ts";

Deno.test("dashboard secret manager creates, unlocks, and updates compatible encrypted files", async () => {
  const keys = await generateKeyPair();
  const protectedKey = await encryptPrivateKey(keys.privateKey, "test-password");
  const initial = await encryptFileContent("first", keys.publicKey, protectedKey.encryptedPrivateKey, protectedKey.salt, { description: "API login", publicMetadata: { account: "dev@example.com", originalName: "note.md", mimeType: "text/markdown", sourceKind: "workspace-file" } });
  assertEquals(await decryptFileContent(initial, "test-password"), "first");
  const updated = await reencryptFileContent(initial, "second", "test-password");
  assertEquals(await decryptFileContent(updated, "test-password"), "second");
  assertEquals(getEncryptedFileMetadata(updated), { description: "API login", publicMetadata: { account: "dev@example.com", originalName: "note.md", mimeType: "text/markdown", sourceKind: "workspace-file" } });
});
