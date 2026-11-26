/**
 * Retrieval models embed the searched-for text ("query") and the searched-in text
 * ("passage") slightly differently, so callers say which one they are embedding.
 */
export type EmbedKind = "query" | "passage";

/** Anything that turns texts into embedding vectors (a real model, or a fake in tests). */
export interface Embedder {
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

export type MatchStatus = "met" | "partial" | "gap";

export interface Evidence {
  /** The CV statement that supports the requirement. */
  text: string;
  /** Cosine similarity between the requirement and this statement. */
  score: number;
}

export interface RequirementMatch {
  requirement: string;
  status: MatchStatus;
  /** Similarity of the best-matching CV statement (0 when the CV is empty). */
  score: number;
  /** Supporting CV statements, best first; empty for a gap. */
  evidence: Evidence[];
  /** Named terms in the requirement (e.g. "Kubernetes") that the CV never mentions. */
  missingTerms: string[];
}

export interface MatchOptions {
  /** Best similarity at or above this counts as met. */
  metThreshold?: number;
  /** Best similarity at or above this (but below met) counts as partial. */
  partialThreshold?: number;
  /** Maximum number of evidence lines per requirement. */
  topK?: number;
}

export interface Summary {
  /** 0–100: met counts 1, partial 0.5, gap 0. */
  coverage: number;
  met: number;
  partial: number;
  gaps: number;
  total: number;
}
