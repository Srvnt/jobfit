import { matchRequirements, summarize } from "./match";
import { extractRequirements, segment } from "./segment";
import type { Embedder, MatchOptions, RequirementMatch, Summary } from "./types";

export interface Report {
  matches: RequirementMatch[];
  summary: Summary;
  cvStatements: string[];
  /** Wall-clock time for embedding and matching, in milliseconds. */
  elapsedMs: number;
}

export async function analyze(jobAd: string, cv: string, embedder: Embedder, options?: MatchOptions): Promise<Report> {
  const requirements = extractRequirements(jobAd);
  if (requirements.length === 0) throw new Error("No requirements found in the job ad. Try pasting the full ad.");
  const cvStatements = segment(cv);
  if (cvStatements.length === 0) throw new Error("No statements found in the CV. Try pasting the full CV text.");

  const start = performance.now();
  const matches = await matchRequirements(requirements, cvStatements, embedder, options);
  return { matches, summary: summarize(matches), cvStatements, elapsedMs: performance.now() - start };
}
