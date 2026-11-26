import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEFAULT_OPTIONS, matchRequirements } from "../src/core/match";
import { ACTIVE_MODEL, MODELS, type ModelName } from "../src/embedder/model";
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

let lastMatches: RequirementMatch[] = [];

function report(title: string, cases: Case[], matches: RequirementMatch[]) {
  lastMatches = matches;
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

/**
 * Sweeps both thresholds and returns every setting's score, best first (accuracy, then fewer
 * false "met" results). Different models score on different scales, so each gets its own sweep.
 */
async function sweep(run: (options: MatchOptions) => Promise<RequirementMatch[]>) {
  const results: { met: number; partial: number; s: Score }[] = [];
  for (let met = 0.3; met <= 0.95001; met += 0.01) {
    for (let partial = 0.2; partial <= met - 0.0299; partial += 0.01) {
      const options = { metThreshold: +met.toFixed(2), partialThreshold: +partial.toFixed(2) };
      results.push({ met: options.metThreshold, partial: options.partialThreshold, s: score(CASES, await run(options)) });
    }
  }
  return results.sort((a, b) => b.s.accuracy - a.s.accuracy || a.s.falseMet - b.s.falseMet);
}

it("evaluates the matcher on the labelled cases", { timeout: 1_800_000 }, async () => {
  const requirements = CASES.map((c) => c.requirement);
  const names = (process.env.EVAL_MODELS?.split(",") ?? Object.keys(MODELS)) as ModelName[];
  const summary: string[] = [];

  for (const name of names) {
    const model = MODELS[name];
    const embedder = nodeEmbedder(model);
    const run = (options: MatchOptions = {}) => matchRequirements(requirements, CANDIDATE, embedder, options);

    if (model === ACTIVE_MODEL) {
      report(
        `${name} (active) with the app defaults (met ≥ ${DEFAULT_OPTIONS.metThreshold}, partial ≥ ${DEFAULT_OPTIONS.partialThreshold})`,
        CASES,
        await run(),
      );
    }
    const ranked = await sweep(run);
    const best = ranked[0];
    const fullReport = report(
      `${name} at its best thresholds (met ≥ ${best.met}, partial ≥ ${best.partial})`,
      CASES,
      await run({ metThreshold: best.met, partialThreshold: best.partial }),
    );
    const byLang = (lang: "fi" | undefined) => {
      const idx = CASES.map((c, i) => [c, i] as const).filter(([c]) => c.lang === lang);
      return pct(idx.filter(([c, i]) => c.expected === lastMatches[i].status).length / idx.length);
    };
    summary.push(
      `${name.padEnd(32)} ${String(model.sizeMB).padStart(4)} MB   met ≥ ${best.met.toFixed(2)}, partial ≥ ${best.partial.toFixed(2)}   ` +
        `${pct(fullReport.accuracy).padStart(4)}   EN ${byLang(undefined).padStart(4)}   FI ${byLang("fi").padStart(4)}   false met ${fullReport.falseMet}`,
    );
    // How much does accuracy move if the met threshold is a little off? A robust choice moves little.
    const sensitivity = await Promise.all(
      [-0.04, -0.02, 0.02, 0.04].map(async (d) => {
        const met = +(best.met + d).toFixed(2);
        const s = score(CASES, await run({ metThreshold: met, partialThreshold: Math.min(best.partial, met - 0.03) }));
        return `${met.toFixed(2)}: ${pct(s.accuracy)}`;
      }),
    );
    output.push(`  met threshold sensitivity (partial ≥ ${best.partial}): ${sensitivity.join(", ")}`);
    output.push(
      "  next best settings: " +
        ranked
          .slice(1, 5)
          .map((r) => `${r.met.toFixed(2)}/${r.partial.toFixed(2)} ${pct(r.s.accuracy)}`)
          .join(", "),
    );
  }

  output.unshift(
    "=== model comparison (each at its own best thresholds; small set, so treat differences of 1–2 cases as noise) ===",
    ...summary,
  );
  const text = output.join("\n") + "\n";
  writeFileSync(new URL("./results.txt", import.meta.url), text);
  console.log(text);
});
