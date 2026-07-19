export async function executeWorkflowScript(
  code: string,
  variables: Record<string, string | number>,
  timeoutMs = 10_000,
): Promise<unknown> {
  const source = `
self.onmessage = async (event) => {
  try {
    self.fetch = undefined;
    self.WebSocket = undefined;
    self.EventSource = undefined;
    self.importScripts = undefined;
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const run = new AsyncFunction("variables", "\\\"use strict\\\"; const window=undefined, document=undefined, localStorage=undefined, indexedDB=undefined, navigator=undefined, self=undefined, globalThis=undefined, XMLHttpRequest=undefined;\\n" + event.data.code);
    const result = await run(Object.freeze(event.data.variables));
    self.postMessage({ result: result === undefined ? "" : result });
  } catch (error) {
    self.postMessage({ error: error && error.message ? error.message : String(error) });
  }
};`;
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  const worker = new Worker(url);
  try {
    return await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        worker.terminate();
        reject(new Error(`Script timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      worker.onmessage = (
        event: MessageEvent<{ result?: unknown; error?: string }>,
      ) => {
        window.clearTimeout(timer);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.result);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timer);
        reject(new Error(event.message));
      };
      worker.postMessage({ code, variables });
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}
