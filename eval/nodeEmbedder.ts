import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import type { Embedder } from "../src/core/types";
import { MODEL_DTYPE, MODEL_ID, POOLING, QUERY_PREFIX } from "../src/embedder/model";

/** The same model as the browser worker, run in Node, with a cache so repeated texts are embedded once. */
export function nodeEmbedder(): Embedder {
  const model = pipeline("feature-extraction", MODEL_ID, { dtype: MODEL_DTYPE }) as Promise<FeatureExtractionPipeline>;
  const cache = new Map<string, number[]>();
  return {
    async embed(texts, kind) {
      const key = (t: string) => `${kind}\u0000${t}`;
      const missing = [...new Set(texts.filter((t) => !cache.has(key(t))))];
      if (missing.length) {
        const input = kind === "query" ? missing.map((t) => QUERY_PREFIX + t) : missing;
        const vectors = (await (await model)(input, { pooling: POOLING, normalize: true })).tolist() as number[][];
        missing.forEach((t, i) => cache.set(key(t), vectors[i]));
      }
      return texts.map((t) => cache.get(key(t))!);
    },
  };
}
