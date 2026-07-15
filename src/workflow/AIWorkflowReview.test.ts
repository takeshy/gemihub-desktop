import { assertEquals } from "jsr:@std/assert";
import { parseReviewResponse } from "./AIWorkflowBuilderModal.tsx";

Deno.test("workflow text is not converted into an unknown review issue", () => {
  assertEquals(parseReviewResponse("```hub-workflow\nname: Translator\nnodes: []\n```"), null);
});

Deno.test("review JSON is extracted from fences and provider prose", () => {
  assertEquals(parseReviewResponse('Result follows:\n```json\n{"verdict":"fail","summary":"Needs work","issues":[{"severity":"high","message":"Missing output"}]}\n```'), {
    verdict: "fail",
    summary: "Needs work",
    issues: [{ severity: "high", message: "Missing output" }],
  });
});
