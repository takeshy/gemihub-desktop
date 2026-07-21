import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  encryptFileContent,
  encryptPrivateKey,
  generateKeyPair,
} from "../lib/hybridEncryption.ts";
import { rememberFilePassword } from "../lib/fileEncryption.ts";
import { fileRef } from "../lib/fileRef.ts";
import { readWorkflowWorkspaceFile } from "./encryptedFile.ts";

Deno.test("workflow file reads prompt for and remember an encryption password", async () => {
  const path = "workflow-encrypted-read.md.encrypted";
  const reference = fileRef("workspace", path);
  rememberFilePassword(reference, "");
  const keys = await generateKeyPair();
  const protectedKey = await encryptPrivateKey(keys.privateKey, "secret");
  const encrypted = await encryptFileContent(
    "decrypted workflow content",
    keys.publicKey,
    protectedKey.encryptedPrivateKey,
    protectedKey.salt,
    {
      publicMetadata: {
        originalName: "workflow-encrypted-read.md",
        mimeType: "text/markdown",
      },
    },
  );
  const readFile = async () => ({
    path,
    fileName: path,
    content: encrypted,
  });
  let prompts = 0;
  const first = await readWorkflowWorkspaceFile(path, "panel", {
    readFile,
    promptForPassword: async () => {
      prompts++;
      return "secret";
    },
  });
  const second = await readWorkflowWorkspaceFile(path, "panel", {
    readFile,
    promptForPassword: async () => {
      prompts++;
      return null;
    },
  });

  assertEquals(first?.content, "decrypted workflow content");
  assertEquals(first?.originalName, "workflow-encrypted-read.md");
  assertEquals(first?.mimeType, "text/markdown");
  assertEquals(second?.content, "decrypted workflow content");
  assertEquals(prompts, 1);
  rememberFilePassword(reference, "");
});

Deno.test("headless workflows reject encrypted file reads without prompting", async () => {
  let prompted = false;
  await assertRejects(
    () =>
      readWorkflowWorkspaceFile("secret.encrypted", "headless", {
        readFile: async () => ({
          path: "secret.encrypted",
          fileName: "secret.encrypted",
          content: "---\nencrypted: true\nkey: key\nsalt: salt\n---\ndata",
        }),
        promptForPassword: async () => {
          prompted = true;
          return "secret";
        },
      }),
    Error,
    "Cannot read encrypted file in headless workflow",
  );
  assertEquals(prompted, false);
});
