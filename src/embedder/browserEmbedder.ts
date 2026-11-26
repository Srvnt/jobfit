import type { Embedder } from "../core/types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export type ProgressListener = (file: string, progress: number) => void;

/** Runs the embedding model in a Web Worker, entirely on the visitor's device. */
export function createBrowserEmbedder(onProgress?: ProgressListener): Embedder {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve: (v: number[][]) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    if (data.type === "progress") return onProgress?.(data.file, data.progress);
    const request = pending.get(data.id);
    pending.delete(data.id);
    if (data.type === "result") request?.resolve(data.vectors);
    else request?.reject(new Error(data.message));
  };

  return {
    embed(texts, kind) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, texts, kind } satisfies WorkerRequest);
      });
    },
  };
}
