import { keyTerms, missingTerms } from "./terms";
import type { Embedder, MatchOptions, MatchStatus, RequirementMatch, Statement, Summary } from "./types";

/**
 * Defaults for the active model (paraphrase-multilingual-MiniLM), checked with `npm run eval`
 * (see eval/results.txt): 0.43 for met is the best value on the labelled set, and accuracy stays
 * within 5 points for ±0.04. For partial, 0.29–0.33 all score the same, so 0.31 sits in the middle.
 * Each model scores on its own scale: change these together with ACTIVE_MODEL.
 */
export const DEFAULT_OPTIONS: Required<MatchOptions> = {
  metThreshold: 0.43,
  partialThreshold: 0.31,
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

const STATUS_RANK: Record<MatchStatus, number> = { gap: 0, partial: 1, met: 2 };

/** "Python, Java or TypeScript", "Docker / Podman", "Javalla tai Pythonilla": any one of the named terms will do. */
const ALTERNATIVES = /\b(or|tai)\b|\s\/\s/i;

/**
 * Status from the best similarity. Embeddings blur named skills together ("Swedish" ≈ "English"),
 * so a missing named skill costs one level, however similar the wording. When the requirement
 * offers alternatives, that applies only if none of them is mentioned.
 */
function classify(
  requirement: string,
  score: number,
  missing: string[],
  metThreshold: number,
  partialThreshold: number,
): MatchStatus {
  const status: MatchStatus = score >= metThreshold ? "met" : score >= partialThreshold ? "partial" : "gap";
  if (missing.length === 0) return status;
  if (ALTERNATIVES.test(requirement) && missing.length < keyTerms(requirement).length) return status;
  return status === "met" ? "partial" : "gap";
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
    const status = classify(requirement, score, missing, metThreshold, partialThreshold);
    const evidence = status === "gap" ? [] : ranked.filter((e) => e.score >= partialThreshold).slice(0, topK);

    // Would the CV on its own earn this status? If not, the other sources are doing the work.
    const cvTexts = statements.filter((s) => s.source.kind === "cv").map((s) => s.text);
    const cvBest = ranked.find((e) => e.source.kind === "cv")?.score ?? 0;
    const cvStatus = classify(requirement, cvBest, missingTerms(requirement, cvTexts), metThreshold, partialThreshold);
    const cvAloneWeaker = STATUS_RANK[cvStatus] < STATUS_RANK[status];

    return { requirement, status, score, evidence, missingTerms: missing, cvAloneWeaker };
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
