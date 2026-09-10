import { assertEquals } from "jsr:@std/assert";
import { resamplePCM16 } from "./pcmCapture.ts";
Deno.test("live PCM capture resamples and clamps audio", () => {
  assertEquals([...resamplePCM16(new Float32Array([-2, 0, 2, 0]), 4, 2)], [
    -32768,
    32767,
  ]);
});
