import type { Embedder, EmbedKind } from "./types";

/**
 * Deterministic stand-in for a real embedding model, used in tests:
 * each text becomes a normalised bag-of-words vector over a shared vocabulary,
 * so texts that share words get a high cosine similarity. Records each call.
 */
export function fakeEmbedder(): Embedder & { calls: { kind: EmbedKind; count: number }[] } {
  const vocab = new Map<string, number>();
  const tokenize = (t: string) => t.toLowerCase().match(/[a-z0-9+#]+/g) ?? [];
  const self = {
    calls: [] as { kind: EmbedKind; count: number }[],
    async embed(texts: string[], kind: EmbedKind) {
      self.calls.push({ kind, count: texts.length });
      texts.flatMap(tokenize).forEach((w) => vocab.has(w) || vocab.set(w, vocab.size));
      return texts.map((t) => {
        const v = new Array(64).fill(0);
        for (const w of tokenize(t)) v[vocab.get(w)! % 64] += 1;
        const norm = Math.hypot(...v) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
  return self;
}
