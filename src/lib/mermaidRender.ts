let queue: Promise<void> = Promise.resolve();

export interface MermaidRenderOptions {
  chart: string;
  isDark: boolean;
}

export function enqueueMermaidRender(
  options: MermaidRenderOptions,
  isCancelled: () => boolean,
): Promise<string | null> {
  let resolve: (value: string | null) => void;
  let reject: (reason: unknown) => void;
  const promise = new Promise<string | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  queue = queue.then(async () => {
    try {
      resolve!(await render(options, isCancelled, 0));
    } catch (error) {
      reject!(error);
    }
  });

  return promise;
}

async function render(
  options: MermaidRenderOptions,
  isCancelled: () => boolean,
  attempt: number,
): Promise<string | null> {
  if (!options.chart || isCancelled()) return null;

  const id = `mermaid-${Date.now()}-${attempt}`;
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: options.isDark ? "dark" : "default",
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
        curve: "basis",
      },
      securityLevel: "strict",
      suppressErrorRendering: true,
    });

    const { svg } = await mermaid.render(id, options.chart);
    return isCancelled() ? null : svg;
  } catch (error) {
    document.getElementById(id)?.remove();
    if (attempt < 1 && !isCancelled()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return render(options, isCancelled, attempt + 1);
    }
    throw error;
  }
}
