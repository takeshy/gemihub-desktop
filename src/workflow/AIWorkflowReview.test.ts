import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { parseReviewResponse } from "./AIWorkflowBuilderModal.tsx";

test("workflow text is not converted into an unknown review issue", () => {
  assertEquals(
    parseReviewResponse("```hub-workflow\nname: Translator\nnodes: []\n```"),
    null,
  );
});

test("review JSON is extracted from fences and provider prose", () => {
  assertEquals(
    parseReviewResponse(
      'Result follows:\n```json\n{"verdict":"fail","summary":"Needs work","issues":[{"severity":"high","message":"Missing output"}]}\n```',
    ),
    {
      verdict: "fail",
      summary: "Needs work",
      issues: [{ severity: "high", message: "Missing output" }],
    },
  );
});

test("a high severity issue cannot be accepted with a pass verdict", () => {
  const review = parseReviewResponse(
    '{"verdict":"pass","summary":"Looks fine","issues":[{"severity":"high","message":"Broken connection"}]}',
  );
  assertEquals(review?.verdict, "fail");
});
