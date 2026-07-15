import { assertEquals } from "jsr:@std/assert";
import {
  getSecretManagerSessionPassword,
  setSecretManagerSessionPassword,
} from "./secretManagerSession.ts";

Deno.test("secret manager passwords are isolated per manager for the session", () => {
  setSecretManagerSessionPassword("manager-a", "password-a");
  setSecretManagerSessionPassword("manager-b", "password-b");

  assertEquals(getSecretManagerSessionPassword("manager-a"), "password-a");
  assertEquals(getSecretManagerSessionPassword("manager-b"), "password-b");
  assertEquals(getSecretManagerSessionPassword("manager-c"), "");

  setSecretManagerSessionPassword("manager-a", "");
  setSecretManagerSessionPassword("manager-b", "");
});

