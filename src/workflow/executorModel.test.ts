import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { isWorkflowImageGenerationModel } from "./executor.ts";

test("workflow image models are distinguished from text models", () => {
  assertEquals(isWorkflowImageGenerationModel("gemini-3.8-flash"), false);
  assertEquals(
    isWorkflowImageGenerationModel("gemini-3.1-flash-image-preview"),
    true,
  );
  assertEquals(isWorkflowImageGenerationModel("imagen-4.0-generate-001"), true);
});
