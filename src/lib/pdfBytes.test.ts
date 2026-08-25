import { assertEquals } from "jsr:@std/assert";
import { hasPdfHeader } from "./pdfBytes.ts";

Deno.test("PDF detection accepts a signature near the beginning", () => {
  assertEquals(hasPdfHeader(new TextEncoder().encode("%PDF-1.7\n")), true);
  assertEquals(hasPdfHeader(new TextEncoder().encode("\n %PDF-2.0\n")), true);
});

Deno.test("PDF detection rejects truncated or foreign content", () => {
  assertEquals(hasPdfHeader(new TextEncoder().encode("%PDF")), false);
  assertEquals(hasPdfHeader(new TextEncoder().encode("not a pdf")), false);
  assertEquals(hasPdfHeader(new Uint8Array(0)), false);
});
