import { describe, expect, it } from "vitest";
import { cosineSimilarity, matchRequirements, summarize } from "./match";
import { fakeEmbedder } from "./testing";
import type { RequirementMatch } from "./types";

describe("cosineSimilarity", () => {
  it("is 1 for identical direction and 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("throws when the vectors have different lengths", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length/);
  });
});

describe("matchRequirements", () => {
  const cv = [
    "Built ETL data pipelines in Python and Airflow",
    "Led a team of four engineers",
    "Designed REST APIs in Node",
  ];

  it("links each requirement to the CV lines that support it, best first", async () => {
    const [match] = await matchRequirements(["Experience building data pipelines in Python"], cv, fakeEmbedder());
    expect(match.evidence[0].text).toBe("Built ETL data pipelines in Python and Airflow");
    const scores = match.evidence.map((e) => e.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("classifies requirements as met, partial or gap using the thresholds", async () => {
    const matches = await matchRequirements(
      [
        "Built ETL data pipelines in Python and Airflow", // identical → met
        "Led a team of engineers in cloud ops", // some overlap → partial
        "Fluent Swedish speaker", // no overlap → gap
      ],
      cv,
      fakeEmbedder(),
      { metThreshold: 0.9, partialThreshold: 0.3 },
    );
    expect(matches.map((m) => m.status)).toEqual(["met", "partial", "gap"]);
  });

  it("returns no evidence for a gap and at most `topK` items otherwise", async () => {
    const [gap, hit] = await matchRequirements(
      ["Fluent Swedish speaker", "Python pipelines and APIs for the team"],
      cv,
      fakeEmbedder(),
      { topK: 2, partialThreshold: 0.1 },
    );
    expect(gap.evidence).toEqual([]);
    expect(hit.evidence.length).toBeLessThanOrEqual(2);
    expect(hit.evidence.every((e) => e.score >= 0.1)).toBe(true);
  });

  it("embeds requirements as queries and CV lines as passages, one batch each", async () => {
    const embedder = fakeEmbedder();
    await matchRequirements(["Python pipelines", "Team leadership skills"], cv, embedder);
    expect(embedder.calls).toEqual([
      { kind: "query", count: 2 },
      { kind: "passage", count: 3 },
    ]);
  });

  it("downgrades met to partial when the requirement names a term the CV never mentions", async () => {
    const [match] = await matchRequirements(
      ["Led a team of four Kubernetes engineers"],
      cv,
      fakeEmbedder(),
      { metThreshold: 0.5, partialThreshold: 0.3 },
    );
    expect(match.status).toBe("partial");
    expect(match.missingTerms).toEqual(["Kubernetes"]);
  });

  it("downgrades partial to gap, with no evidence, when a named term is missing", async () => {
    const [match] = await matchRequirements(
      ["Led Kubernetes migrations for Swedish banks"], // shares only "led" with the CV: raw score ≈ 0.17
      cv,
      fakeEmbedder(),
      { metThreshold: 0.9, partialThreshold: 0.1 },
    );
    expect(match.status).toBe("gap");
    expect(match.evidence).toEqual([]);
    expect(match.missingTerms).toEqual(["Kubernetes", "Swedish"]);
  });

  it("reports no missing terms when the named terms are in the CV", async () => {
    const [match] = await matchRequirements(["Python data pipelines"], cv, fakeEmbedder());
    expect(match.missingTerms).toEqual([]);
  });

  it("returns an empty list when there are no requirements, and all gaps when the CV is empty", async () => {
    expect(await matchRequirements([], cv, fakeEmbedder())).toEqual([]);
    const matches = await matchRequirements(["Experience with Python data pipelines"], [], fakeEmbedder());
    expect(matches).toEqual([
      { requirement: "Experience with Python data pipelines", status: "gap", score: 0, evidence: [], missingTerms: ["Python"] },
    ]);
  });
});

describe("summarize", () => {
  const m = (status: RequirementMatch["status"]): RequirementMatch => ({
    requirement: status,
    status,
    score: 0,
    evidence: [],
    missingTerms: [],
  });

  it("scores met as 1, partial as 0.5 and gap as 0, as a rounded percentage", () => {
    expect(summarize([m("met"), m("partial"), m("gap")])).toEqual({ coverage: 50, met: 1, partial: 1, gaps: 1, total: 3 });
    expect(summarize([m("met"), m("met"), m("partial")]).coverage).toBe(83);
  });

  it("reports zero coverage for an empty list instead of dividing by zero", () => {
    expect(summarize([])).toEqual({ coverage: 0, met: 0, partial: 0, gaps: 0, total: 0 });
  });
});
