import type { FileOpenRequest } from "./wailsBackend";

/** Serialize directory changes and ignore requests superseded during a read. */
export function createFileOpenHandler(actions: {
  prepare: (request: FileOpenRequest) => Promise<void>;
  apply: (request: FileOpenRequest) => void;
  acknowledge: (id: number) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  let latestID = 0;
  let pending = Promise.resolve();
  return (request: FileOpenRequest) => {
    if (request.id <= latestID) return pending;
    latestID = request.id;
    pending = pending.then(async () => {
      if (request.id !== latestID) return;
      await actions.prepare(request);
      if (request.id !== latestID) return;
      actions.apply(request);
      await actions.acknowledge(request.id);
    }).catch(actions.onError);
    return pending;
  };
}

export function fileOpenDirectory(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (separator === 0) return path.slice(0, 1);
  if (separator === 2 && /^[a-z]:/i.test(path)) return path.slice(0, 3);
  return separator > 0 ? path.slice(0, separator) : "";
}
