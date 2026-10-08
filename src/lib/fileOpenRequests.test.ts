import { assertEquals } from "jsr:@std/assert";
import {
  createFileOpenHandler,
  fileOpenDirectory,
} from "./fileOpenRequests.ts";

Deno.test("a queued cold-launch request and its event open the file only once", async () => {
  const opened: string[] = [];
  const acknowledged: number[] = [];
  const handle = createFileOpenHandler({
    prepare: () => Promise.resolve(),
    apply: (request) => {
      opened.push(request.path);
    },
    acknowledge: (id) => {
      acknowledged.push(id);
      return Promise.resolve();
    },
    onError: (error) => {
      throw error;
    },
  });
  const request = { id: 1, path: "/notes/new.md" };
  await Promise.all([handle(request), handle(request)]);
  assertEquals(opened, ["/notes/new.md"]);
  assertEquals(acknowledged, [1]);
  // A later Finder open of the same path must refresh the file.
  await handle({ ...request, id: 2 });
  assertEquals(opened, ["/notes/new.md", "/notes/new.md"]);
});

Deno.test("a newer Finder request supersedes an in-flight open after preparation", async () => {
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const preparing = new Promise<void>((resolve) => {
    started = resolve;
  });
  const order: string[] = [];
  const handle = createFileOpenHandler({
    prepare: async (request) => {
      order.push(`prepare:${request.id}`);
      if (request.id === 1) {
        started();
        await waiting;
      }
    },
    apply: (request) => {
      order.push(`apply:${request.id}`);
    },
    acknowledge: (id) => {
      order.push(`ack:${id}`);
      return Promise.resolve();
    },
    onError: (error) => {
      throw error;
    },
  });
  const first = handle({ id: 1, path: "/old/file.md" });
  await preparing;
  const second = handle({ id: 2, path: "/new/file.md" });
  release();
  await Promise.all([first, second]);
  assertEquals(order, ["prepare:1", "prepare:2", "apply:2", "ack:2"]);
});

Deno.test("a failed save prevents switching directories and does not block later opens", async () => {
  const opened: number[] = [];
  const errors: unknown[] = [];
  const handle = createFileOpenHandler({
    prepare: (request) =>
      request.id === 1 ? Promise.reject("save failed") : Promise.resolve(),
    apply: (request) => {
      opened.push(request.id);
    },
    acknowledge: () => Promise.resolve(),
    onError: (error) => {
      errors.push(error);
    },
  });
  await handle({ id: 1, path: "/old.md" });
  await handle({ id: 2, path: "/new.md" });
  assertEquals(opened, [2]);
  assertEquals(errors, ["save failed"]);
});

Deno.test("associated file parent handles root directories and Windows paths", () => {
  assertEquals(fileOpenDirectory("/file.md"), "/");
  assertEquals(fileOpenDirectory("/notes/new.md"), "/notes");
  assertEquals(fileOpenDirectory("C:\\notes\\new.md"), "C:\\notes");
  assertEquals(fileOpenDirectory("C:\\new.md"), "C:\\");
});
