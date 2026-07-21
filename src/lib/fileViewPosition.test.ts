import { assertEquals } from "jsr:@std/assert";
import {
  parseFileViewPosition,
  restoredScrollTop,
} from "./fileViewPosition.ts";

Deno.test("file view positions restore by ratio and reject another file", () => {
  const raw = JSON.stringify({
    key: "workspace:manual.pdf:pdf",
    targetPath: [0, 1],
    top: 420,
    ratio: 0.25,
    anchor: { kind: "pdf-page", page: 12, offset: 0.4 },
  });
  const position = parseFileViewPosition(
    raw,
    "workspace:manual.pdf:pdf",
  );
  assertEquals(position?.targetPath, [0, 1]);
  assertEquals(position?.anchor, {
    kind: "pdf-page",
    page: 12,
    offset: 0.4,
  });
  assertEquals(restoredScrollTop(position!, 2000), 500);
  assertEquals(parseFileViewPosition(raw, "workspace:other.pdf:pdf"), null);
});
