import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import { fakeEmbedder } from "./testing";

describe("analyze", () => {
  const jobAd = "Requirements:\n- Experience with Python data pipelines\n- Fluent Swedish speaker\n\nWe offer:\n- Free lunch every single day";
  const cv = "Experience\n- Built Python data pipelines with Airflow\n- Led a small team of engineers";

  it("segments both texts, matches them and summarizes the result", async () => {
    const report = await analyze(jobAd, cv, fakeEmbedder(), { metThreshold: 0.6, partialThreshold: 0.3 });
    expect(report.matches.map((m) => m.requirement)).toEqual([
      "Experience with Python data pipelines",
      "Fluent Swedish speaker",
    ]);
    expect(report.matches.map((m) => m.status)).toEqual(["met", "gap"]);
    expect(report.summary).toMatchObject({ total: 2, met: 1, gaps: 1, coverage: 50 });
    expect(report.cvStatements).toEqual(["Built Python data pipelines with Airflow", "Led a small team of engineers"]);
  });

  it("rejects input where no requirements or CV statements can be found", async () => {
    await expect(analyze("  ", cv, fakeEmbedder())).rejects.toThrow(/job ad/i);
    await expect(analyze(jobAd, "", fakeEmbedder())).rejects.toThrow(/CV/);
  });
});
