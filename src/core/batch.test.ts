import { describe, expect, it } from "vitest";
import { batchedEmbedder } from "./batch";
import type { Embedder, EmbedKind } from "./types";

function recordingEmbedder() {
  const calls: { texts: string[]; kind: EmbedKind }[] = [];
  const embedder: Embedder = {
    async embed(texts, kind) {
      calls.push({ texts, kind });
      return texts.map((t) => [t.length]);
    },
  };
  return { embedder, calls };
}

describe("batchedEmbedder", () => {
  it("splits large inputs into batches and returns vectors in the original order", async () => {
    const { embedder, calls } = recordingEmbedder();
    const texts = ["a", "bb", "ccc", "dddd", "eeeee"];
    const vectors = await batchedEmbedder(embedder, 2).embed(texts, "passage");
    expect(calls.map((c) => c.texts)).toEqual([["a", "bb"], ["ccc", "dddd"], ["eeeee"]]);
    expect(calls.every((c) => c.kind === "passage")).toBe(true);
    expect(vectors).toEqual([[1], [2], [3], [4], [5]]);
  });

  it("makes no calls for an empty input", async () => {
    const { embedder, calls } = recordingEmbedder();
    expect(await batchedEmbedder(embedder, 2).embed([], "query")).toEqual([]);
    expect(calls).toEqual([]);
  });
});
