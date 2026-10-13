import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import {
  workspacePathFromRelative,
  workspaceRelativePath,
} from "./markdownWorkspaceAssets.ts";

test("Workspace assets use paths relative to the Markdown source", () => {
  assertEquals(
    workspaceRelativePath(
      "projects/tasks/Card.md",
      "projects/tasks/attachments/image.png",
    ),
    "attachments/image.png",
  );
  assertEquals(
    workspaceRelativePath("articles/Post.md", "assets/image.png"),
    "../assets/image.png",
  );
  assertEquals(
    workspaceRelativePath("Post.md", "assets/image.png"),
    "assets/image.png",
  );
});

test("relative Markdown images resolve back into the Workspace", () => {
  assertEquals(
    workspacePathFromRelative(
      "projects/tasks/Card.md",
      "../../attachments/IMG_8098.jpeg",
    ),
    "attachments/IMG_8098.jpeg",
  );
});
