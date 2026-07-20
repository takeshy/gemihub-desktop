import { assertEquals } from "jsr:@std/assert";
import { isWorkflowImageGenerationModel } from "./executor.ts";

Deno.test("workflow image models are distinguished from text models", () => {
  assertEquals(isWorkflowImageGenerationModel("gemini-3.5-flash"), false);
  assertEquals(
    isWorkflowImageGenerationModel("gemini-3.1-flash-image-preview"),
    true,
  );
  assertEquals(isWorkflowImageGenerationModel("imagen-4.0-generate-001"), true);
});
