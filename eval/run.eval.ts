import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEFAULT_OPTIONS, matchRequirements } from "../src/core/match";
import type { MatchOptions, MatchStatus, RequirementMatch } from "../src/core/types";
import { CANDIDATE, CASES, type Case } from "./cases";
import { nodeEmbedder } from "./nodeEmbedder";

/**
 * `npm run eval`: runs the labelled cases through the real model and matcher, prints accuracy,
 * a confusion matrix and the misses, then sweeps the thresholds. Not part of `npm test`: it
 * downloads the model and is about measuring, not pass/fail.
 */

const STATUSES: MatchStatus[] = ["met", "partial", "gap"];

interface Score {
  accuracy: number;
  correct: number;
  falseMet: number;
  confusion: Record<MatchStatus, Record<MatchStatus, number>>;
}

function score(cases: Case[], matches: RequirementMatch[]): Score {
  const confusion = Object.fromEntries(STATUSES.map((s) => [s, { met: 0, partial: 0, gap: 0 }])) as Score["confusion"];
  let correct = 0;
  let falseMet = 0;
  cases.forEach((c, i) => {
    const got = matches[i].status;
    confusion[c.expected][got]++;
    if (got === c.expected) correct++;
    if (got === "met" && c.expected === "gap") falseMet++;
  });
  return { accuracy: correct / cases.length, correct, falseMet, confusion };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const output: string[] = [];

function report(title: string, cases: Case[], matches: RequirementMatch[]) {
  const all = score(cases, matches);
  const en = score(cases.filter((c) => c.lang !== "fi"), matches.filter((_, i) => cases[i].lang !== "fi"));
  const fi = score(cases.filter((c) => c.lang === "fi"), matches.filter((_, i) => cases[i].lang === "fi"));
  const lines = [
    `\n=== ${title} ===`,
    `accuracy ${pct(all.accuracy)} (${all.correct}/${cases.length})  ·  English ${pct(en.accuracy)}  ·  Finnish ${pct(fi.accuracy)}  ·  false "met" for a gap: ${all.falseMet}`,
    `expected \\ got   met  partial  gap`,
    ...STATUSES.map((s) => `${s.padEnd(16)} ${STATUSES.map((g) => String(all.confusion[s][g]).padStart(4)).join("     ")}`),
    `misses:`,
    ...cases.flatMap((c, i) => {
      const m = matches[i];
      if (m.status === c.expected) return [];
      const missing = m.missingTerms.length ? `  missing: ${m.missingTerms.join(", ")}` : "";
      return [`  ${c.expected.padEnd(7)} → ${m.status.padEnd(7)} ${m.score.toFixed(2)}  ${c.requirement.slice(0, 70)}${missing}`];
    }),
  ];
  output.push(...lines);
  return all;
}

it("evaluates the matcher on the labelled cases", { timeout: 600_000 }, async () => {
  const embedder = nodeEmbedder();
  const requirements = CASES.map((c) => c.requirement);
  const run = (options: MatchOptions = {}) => matchRequirements(requirements, CANDIDATE, embedder, options);

  report(`current defaults (met ≥ ${DEFAULT_OPTIONS.metThreshold}, partial ≥ ${DEFAULT_OPTIONS.partialThreshold})`, CASES, await run());

  // Threshold sweep, ranked by accuracy and then by fewer false "met" results.
  const sweep: { met: number; partial: number; s: Score }[] = [];
  for (let met = 0.55; met <= 0.8001; met += 0.01) {
    for (let partial = 0.4; partial <= met - 0.0499; partial += 0.01) {
      const options = { metThreshold: +met.toFixed(2), partialThreshold: +partial.toFixed(2) };
      sweep.push({ met: options.metThreshold, partial: options.partialThreshold, s: score(CASES, await run(options)) });
    }
  }
  sweep.sort((a, b) => b.s.accuracy - a.s.accuracy || a.s.falseMet - b.s.falseMet);
  output.push(
    "\n=== best thresholds on this set (beware of overfitting a small set) ===",
    ...sweep
      .slice(0, 8)
      .map((r) => `  met ≥ ${r.met.toFixed(2)}, partial ≥ ${r.partial.toFixed(2)}: ${pct(r.s.accuracy)}, false met ${r.s.falseMet}`),
  );
  const text = output.join("\n") + "\n";
  writeFileSync(new URL("./results.txt", import.meta.url), text);
  console.log(text);
});
