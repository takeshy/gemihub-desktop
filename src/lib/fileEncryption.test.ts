import { assertEquals } from "jsr:@std/assert";
import {
  encryptedPathFor,
  rememberedFilePassword,
  rememberFilePassword,
} from "./fileEncryption.ts";
import { fileRef } from "./fileRef.ts";

Deno.test("encrypted paths and session passwords retain FileRef scope", () => {
  assertEquals(
    encryptedPathFor("notes/readme.md"),
    "notes/readme.md.encrypted",
  );
  assertEquals(
    encryptedPathFor("notes/readme.md.encrypted"),
    "notes/readme.md.encrypted",
  );
  const encryptedFile = fileRef("workspace", "notes/readme.md.encrypted");
  rememberFilePassword(encryptedFile, "temporary");
  assertEquals(
    rememberedFilePassword(encryptedFile),
    "temporary",
  );
  rememberFilePassword(encryptedFile, "");
});
