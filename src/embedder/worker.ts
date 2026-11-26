/// <reference lib="webworker" />
import { pipeline, type FeatureExtractionPipeline, type ProgressInfo } from "@huggingface/transformers";
import { ACTIVE_MODEL as MODEL, withPrefix } from "./model";
import type { WorkerRequest, WorkerResponse } from "./protocol";

let extractor: Promise<FeatureExtractionPipeline> | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

function load(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline("feature-extraction", MODEL.id, {
    dtype: MODEL.dtype,
    progress_callback: (p: ProgressInfo) => {
      if (p.status === "progress") post({ type: "progress", file: p.file, progress: p.progress });
    },
  }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const model = await load();
    const output = await model(withPrefix(MODEL, data.texts, data.kind), { pooling: MODEL.pooling, normalize: true });
    post({ type: "result", id: data.id, vectors: output.tolist() as number[][] });
  } catch (err) {
    extractor = null; // allow a retry after e.g. a network failure
    post({ type: "error", id: data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
