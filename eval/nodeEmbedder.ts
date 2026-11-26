import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import type { Embedder } from "../src/core/types";
import { ACTIVE_MODEL, withPrefix, type ModelConfig } from "../src/embedder/model";

/** A model run in Node exactly as the browser worker runs it, with a cache so repeated texts are embedded once. */
export function nodeEmbedder(model: ModelConfig = ACTIVE_MODEL): Embedder {
  const extractor = pipeline("feature-extraction", model.id, { dtype: model.dtype }) as Promise<FeatureExtractionPipeline>;
  const cache = new Map<string, number[]>();
  return {
    async embed(texts, kind) {
      const key = (t: string) => `${kind}\u0000${t}`;
      const missing = [...new Set(texts.filter((t) => !cache.has(key(t))))];
      if (missing.length) {
        const output = await (await extractor)(withPrefix(model, missing, kind), { pooling: model.pooling, normalize: true });
        const vectors = output.tolist() as number[][];
        missing.forEach((t, i) => cache.set(key(t), vectors[i]));
      }
      return texts.map((t) => cache.get(key(t))!);
    },
  };
}
