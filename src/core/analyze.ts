import { matchRequirements, summarize } from "./match";
import { extractRequirements, segment } from "./segment";
import type { Embedder, EvidenceSource, MatchOptions, RequirementMatch, Statement, Summary } from "./types";

/** A fetched page of the candidate's portfolio, already reduced to text. */
export interface PortfolioPage {
  url: string;
  title: string;
  text: string;
}

export interface Candidate {
  cv: string;
  portfolio?: PortfolioPage[];
}

export interface Report {
  matches: RequirementMatch[];
  summary: Summary;
  /** Every statement matched against, CV first. */
  statements: Statement[];
  /** Wall-clock time for embedding and matching, in milliseconds. */
  elapsedMs: number;
}

const CV_SOURCE: EvidenceSource = { kind: "cv", label: "CV" };

function portfolioSource(url: string): EvidenceSource {
  const path = new URL(url).pathname.replace(/\/$/, "");
  return { kind: "portfolio", label: path ? `Portfolio: ${path}` : "Portfolio", url };
}

/** CV statements first, then each portfolio page's; a statement seen before (any case) is skipped. */
function collectStatements(candidate: Candidate): Statement[] {
  const all: Statement[] = [
    ...segment(candidate.cv).map((text) => ({ text, source: CV_SOURCE })),
    ...(candidate.portfolio ?? []).flatMap((page) =>
      segment(page.text).map((text) => ({ text, source: portfolioSource(page.url) })),
    ),
  ];
  const seen = new Set<string>();
  return all.filter((s) => {
    const key = s.text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function analyze(
  jobAd: string,
  candidate: Candidate,
  embedder: Embedder,
  options?: MatchOptions,
): Promise<Report> {
  const requirements = extractRequirements(jobAd);
  if (requirements.length === 0) throw new Error("No requirements found in the job ad. Try pasting the full ad.");
  const statements = collectStatements(candidate);
  if (!statements.some((s) => s.source.kind === "cv")) {
    throw new Error("No statements found in the CV. Try pasting the full CV text.");
  }

  const start = performance.now();
  const matches = await matchRequirements(requirements, statements, embedder, options);
  return { matches, summary: summarize(matches), statements, elapsedMs: performance.now() - start };
}
