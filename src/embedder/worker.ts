/// <reference lib="webworker" />
import { pipeline, type FeatureExtractionPipeline, type ProgressInfo } from "@huggingface/transformers";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const MODEL_ID = "Xenova/bge-small-en-v1.5";
/** bge models are trained to expect this instruction in front of search queries. */
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

let extractor: Promise<FeatureExtractionPipeline> | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

function load(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
    progress_callback: (p: ProgressInfo) => {
      if (p.status === "progress") post({ type: "progress", file: p.file, progress: p.progress });
    },
  }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const model = await load();
    const texts = data.kind === "query" ? data.texts.map((t) => QUERY_PREFIX + t) : data.texts;
    const output = await model(texts, { pooling: "cls", normalize: true });
    post({ type: "result", id: data.id, vectors: output.tolist() as number[][] });
  } catch (err) {
    extractor = null; // allow a retry after e.g. a network failure
    post({ type: "error", id: data.id, message: err instanceof Error ? err.message : String(err) });
  }
};
