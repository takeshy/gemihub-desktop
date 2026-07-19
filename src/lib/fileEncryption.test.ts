import { assertEquals } from "jsr:@std/assert";
import {
  encryptedPathFor,
  rememberedFilePassword,
  rememberFilePassword,
} from "./fileEncryption.ts";

Deno.test("encrypted workspace paths and session passwords normalize workspace URIs", () => {
  assertEquals(
    encryptedPathFor("files://notes/readme.md"),
    "files://notes/readme.md.encrypted",
  );
  assertEquals(
    encryptedPathFor("notes/readme.md.encrypted"),
    "notes/readme.md.encrypted",
  );
  rememberFilePassword("files://notes/readme.md.encrypted", "temporary");
  assertEquals(
    rememberedFilePassword("notes/readme.md.encrypted"),
    "temporary",
  );
  rememberFilePassword("notes/readme.md.encrypted", "");
});
