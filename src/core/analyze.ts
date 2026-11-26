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

/** How many portfolio statements to use: a large site (a blog, say) would otherwise make analysis slow. */
export interface PortfolioLimits {
  perPage: number;
  total: number;
}

export const DEFAULT_PORTFOLIO_LIMITS: PortfolioLimits = { perPage: 50, total: 150 };

export interface AnalyzeOptions extends MatchOptions {
  portfolioLimits?: PortfolioLimits;
}

export interface Report {
  matches: RequirementMatch[];
  summary: Summary;
  /** Every statement matched against, CV first. */
  statements: Statement[];
  /** True when some portfolio text was left out because of the limits. */
  portfolioTrimmed: boolean;
  /** Wall-clock time for embedding and matching, in milliseconds. */
  elapsedMs: number;
}

const CV_SOURCE: EvidenceSource = { kind: "cv", label: "CV" };

function portfolioSource(url: string): EvidenceSource {
  const path = new URL(url).pathname.replace(/\/$/, "");
  return { kind: "portfolio", label: path ? `Portfolio: ${path}` : "Portfolio", url };
}

/**
 * CV statements first, then each portfolio page's, within the limits; a statement seen
 * before (any case) is skipped. The CV is never trimmed.
 */
function collectStatements(candidate: Candidate, limits: PortfolioLimits): { statements: Statement[]; trimmed: boolean } {
  const seen = new Set<string>();
  const isNew = (text: string) => {
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const statements: Statement[] = segment(candidate.cv)
    .filter(isNew)
    .map((text) => ({ text, source: CV_SOURCE }));
  let trimmed = false;
  let portfolioCount = 0;
  for (const page of candidate.portfolio ?? []) {
    const fresh = segment(page.text).filter(isNew);
    const room = Math.min(limits.perPage, limits.total - portfolioCount);
    if (fresh.length > room) trimmed = true;
    const kept = fresh.slice(0, Math.max(0, room));
    portfolioCount += kept.length;
    statements.push(...kept.map((text) => ({ text, source: portfolioSource(page.url) })));
  }
  return { statements, trimmed };
}

export async function analyze(
  jobAd: string,
  candidate: Candidate,
  embedder: Embedder,
  options: AnalyzeOptions = {},
): Promise<Report> {
  const requirements = extractRequirements(jobAd);
  if (requirements.length === 0) throw new Error("No requirements found in the job ad. Try pasting the full ad.");
  const { statements, trimmed } = collectStatements(candidate, options.portfolioLimits ?? DEFAULT_PORTFOLIO_LIMITS);
  if (!statements.some((s) => s.source.kind === "cv")) {
    throw new Error("No statements found in the CV. Try pasting the full CV text.");
  }

  const start = performance.now();
  const matches = await matchRequirements(requirements, statements, embedder, options);
  return {
    matches,
    summary: summarize(matches),
    statements,
    portfolioTrimmed: trimmed,
    elapsedMs: performance.now() - start,
  };
}
