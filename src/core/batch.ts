import type { Embedder } from "./types";

/**
 * Embeds in small batches. Transformer models pad every text in a batch to the longest one,
 * so one huge batch of mixed-length texts is far slower (and hungrier) than several small ones.
 */
export function batchedEmbedder(inner: Embedder, batchSize = 32): Embedder {
  return {
    async embed(texts, kind) {
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        vectors.push(...(await inner.embed(texts.slice(i, i + batchSize), kind)));
      }
      return vectors;
    },
  };
}
