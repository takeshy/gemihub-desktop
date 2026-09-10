import { assertEquals } from "jsr:@std/assert";
import { createPCMCapture, resamplePCM16 } from "./pcmCapture.ts";
Deno.test("live PCM capture resamples and clamps audio", () => {
  assertEquals([...resamplePCM16(new Float32Array([-2, 0, 2, 0]), 4, 2)], [
    -32768,
    32767,
  ]);
});

class FakeNode {
  connect() {}
  disconnect() {}
}
class FakeProcessor extends FakeNode {
  onaudioprocess: ((event: unknown) => void) | null = null;
}
class FakeContext {
  sampleRate = 8000;
  destination = new FakeNode();
  processor = new FakeProcessor();
  closed = false;
  createMediaStreamSource() {
    return new FakeNode();
  }
  createScriptProcessor() {
    return this.processor;
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

Deno.test("live PCM capture converts a frame before the send is awaited", async () => {
  const context = new FakeContext();
  const globals = globalThis as { AudioContext?: unknown };
  const original = globals.AudioContext;
  globals.AudioContext = function () {
    return context;
  };
  try {
    const chunks: string[] = [];
    const capture = await createPCMCapture(
      {} as MediaStream,
      8000,
      (chunk) => {
        chunks.push(chunk);
        return Promise.resolve();
      },
      () => {},
    );
    // ScriptProcessorNode hands out the same buffer every frame and refills it.
    const shared = new Float32Array([1, 1, 1, 1]);
    context.processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => shared },
    });
    shared.fill(0);
    await capture.stop();
    assertEquals(chunks.length, 1);
    const bytes = Uint8Array.from(atob(chunks[0]), (c) => c.charCodeAt(0));
    assertEquals([...new Int16Array(bytes.buffer)], [
      32767,
      32767,
      32767,
      32767,
    ]);
  } finally {
    globals.AudioContext = original;
  }
});
