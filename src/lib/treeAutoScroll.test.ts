import { assertEquals } from "jsr:@std/assert";
import {
  AUTO_SCROLL_MAX_SPEED,
  AUTO_SCROLL_MIN_SPEED,
  treeAutoScrollDelta,
} from "./treeAutoScroll.ts";

const bounds = { top: 100, bottom: 500, left: 0, right: 200 };

Deno.test("the tree stands still while the drag is in the middle of the list", () => {
  assertEquals(treeAutoScrollDelta(bounds, 100, 300), 0);
  assertEquals(treeAutoScrollDelta(bounds, 100, 140), 0);
  assertEquals(treeAutoScrollDelta(bounds, 100, 460), 0);
});

Deno.test("resting against an edge scrolls toward it, faster the deeper it goes", () => {
  const shallow = treeAutoScrollDelta(bounds, 100, 131);
  const deep = treeAutoScrollDelta(bounds, 100, 100);
  assertEquals(shallow, -AUTO_SCROLL_MIN_SPEED);
  assertEquals(deep, -AUTO_SCROLL_MAX_SPEED);
  assertEquals(treeAutoScrollDelta(bounds, 100, 132), 0);
  assertEquals(treeAutoScrollDelta(bounds, 100, 500), AUTO_SCROLL_MAX_SPEED);
  assertEquals(treeAutoScrollDelta(bounds, 100, 490) > 0, true);
});

Deno.test("a drag that left the list does not scroll it", () => {
  assertEquals(treeAutoScrollDelta(bounds, 400, 105), 0);
  assertEquals(treeAutoScrollDelta(bounds, 100, 95), 0);
  assertEquals(treeAutoScrollDelta(bounds, 100, 505), 0);
});

Deno.test("the edge band never swallows a short list", () => {
  const short = { top: 0, bottom: 80, left: 0, right: 200 };
  assertEquals(treeAutoScrollDelta(short, 100, 40), 0);
  assertEquals(treeAutoScrollDelta(short, 100, 0), -AUTO_SCROLL_MAX_SPEED);
});

Deno.test("a collapsed tree never scrolls", () => {
  assertEquals(
    treeAutoScrollDelta(
      { top: 100, bottom: 100, left: 0, right: 200 },
      100,
      100,
    ),
    0,
  );
});
