import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { pendingFileConfirmRequest } from "./pendingConfirm.ts";

test("AI write proposals are reviewed against the file on disk", () => {
  const request = pendingFileConfirmRequest(
    { kind: "write", path: "workspace://notes/todo.md", content: "next" },
    "current",
  );
  assertEquals(request?.path, "notes/todo.md");
  assertEquals(request?.mode, "replace");
  assertEquals(request?.content, "next");
  assertEquals(request?.originalContent, "current");
});

test("append proposals show the combined result", () => {
  const request = pendingFileConfirmRequest(
    {
      kind: "write",
      path: "workspace://notes/log.md",
      content: "second",
      mode: "append",
    },
    "first",
  );
  assertEquals(request?.mode, "append");
  assertEquals(request?.content, "first\nsecond");
});

test("a write that changes nothing needs no review", () => {
  assertEquals(
    pendingFileConfirmRequest(
      { kind: "write", path: "workspace://notes/todo.md", content: "same" },
      "same",
    ),
    null,
  );
});

test("a new file is reviewed without a before side", () => {
  const request = pendingFileConfirmRequest(
    { kind: "write", path: "workspace://notes/new.md", content: "hello" },
    null,
  );
  assertEquals(request?.content, "hello");
  assertEquals(request?.originalContent, undefined);
});

test("encrypted content is not offered as a diff", () => {
  const request = pendingFileConfirmRequest(
    { kind: "write", path: "workspace://secret.md", content: "plain" },
    "---\nencrypted: true\ndata: AAAA\n---\n",
  );
  assertEquals(request?.originalContent, undefined);
});

test("rename proposals name both paths", () => {
  const request = pendingFileConfirmRequest(
    {
      kind: "rename",
      path: "workspace://notes/old.md",
      newPath: "workspace://notes/new.md",
    },
    null,
  );
  assertEquals(request?.path, "notes/old.md");
  assertEquals(request?.mode, "rename");
  assertEquals(request?.content, "notes/new.md");
});
