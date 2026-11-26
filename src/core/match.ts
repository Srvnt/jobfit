import { missingTerms } from "./terms";
import type { Embedder, MatchOptions, MatchStatus, RequirementMatch, Statement, Summary } from "./types";

/**
 * Defaults tuned for bge-small-en-v1.5 on the evaluation set: real evidence typically
 * scores 0.65+, related-but-different statements 0.5–0.65, unrelated ones below 0.5.
 */
export const DEFAULT_OPTIONS: Required<MatchOptions> = {
  metThreshold: 0.65,
  partialThreshold: 0.5,
  topK: 3,
};

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/** Matches every requirement against every statement (from the CV or elsewhere) and classifies the result. */
export async function matchRequirements(
  requirements: string[],
  statements: Statement[],
  embedder: Embedder,
  options: MatchOptions = {},
): Promise<RequirementMatch[]> {
  const { metThreshold, partialThreshold, topK } = { ...DEFAULT_OPTIONS, ...options };
  if (requirements.length === 0) return [];

  const reqVectors = await embedder.embed(requirements, "query");
  const texts = statements.map((s) => s.text);
  const statementVectors = texts.length ? await embedder.embed(texts, "passage") : [];

  return requirements.map((requirement, i) => {
    const ranked = statements
      .map((s, j) => ({ ...s, score: cosineSimilarity(reqVectors[i], statementVectors[j]) }))
      .sort((a, b) => b.score - a.score);
    const score = ranked[0]?.score ?? 0;
    const missing = missingTerms(requirement, texts);
    let status: MatchStatus = score >= metThreshold ? "met" : score >= partialThreshold ? "partial" : "gap";
    // Embeddings blur named skills together ("Swedish" ≈ "English"), so a named skill the CV
    // never mentions costs one level, however similar the wording.
    if (missing.length > 0) status = status === "met" ? "partial" : "gap";
    const evidence = status === "gap" ? [] : ranked.filter((e) => e.score >= partialThreshold).slice(0, topK);
    const onlyOutsideCv = evidence.length > 0 && evidence.every((e) => e.source.kind !== "cv");
    return { requirement, status, score, evidence, missingTerms: missing, onlyOutsideCv };
  });
}

export function summarize(matches: RequirementMatch[]): Summary {
  const count = (s: MatchStatus) => matches.filter((m) => m.status === s).length;
  const met = count("met");
  const partial = count("partial");
  const total = matches.length;
  const coverage = total === 0 ? 0 : Math.round(((met + partial * 0.5) / total) * 100);
  return { coverage, met, partial, gaps: count("gap"), total };
}
