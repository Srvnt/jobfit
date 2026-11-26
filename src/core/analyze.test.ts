import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import { CV_SOURCE, fakeEmbedder } from "./testing";

describe("analyze", () => {
  const jobAd = "Requirements:\n- Experience with Python data pipelines\n- Fluent Swedish speaker\n\nWe offer:\n- Free lunch every single day";
  const cv = "Experience\n- Built Python data pipelines with Airflow\n- Led a small team of engineers";

  it("segments both texts, matches them and summarizes the result", async () => {
    const report = await analyze(jobAd, { cv }, fakeEmbedder(), { metThreshold: 0.6, partialThreshold: 0.3 });
    expect(report.matches.map((m) => m.requirement)).toEqual([
      "Experience with Python data pipelines",
      "Fluent Swedish speaker",
    ]);
    expect(report.matches.map((m) => m.status)).toEqual(["met", "gap"]);
    expect(report.summary).toMatchObject({ total: 2, met: 1, gaps: 1, coverage: 50 });
    expect(report.statements).toEqual([
      { text: "Built Python data pipelines with Airflow", source: CV_SOURCE },
      { text: "Led a small team of engineers", source: CV_SOURCE },
    ]);
  });

  it("rejects input where no requirements or CV statements can be found", async () => {
    await expect(analyze("  ", { cv }, fakeEmbedder())).rejects.toThrow(/job ad/i);
    await expect(analyze(jobAd, { cv: "" }, fakeEmbedder())).rejects.toThrow(/CV/);
  });

  describe("with portfolio pages", () => {
    const pages = [
      { url: "https://alex.example/", title: "Alex Example", text: "Data engineer building retail data platforms in Helsinki\n- Led a small team of engineers" },
      { url: "https://alex.example/projects/sv", title: "Nordic bank project", text: "Worked daily in fluent Swedish with bank staff" },
    ];

    it("adds each page's statements, labelled with the page path", async () => {
      const report = await analyze(jobAd, { cv, portfolio: pages }, fakeEmbedder(), { partialThreshold: 0.3 });
      const swedish = report.matches.find((m) => m.requirement === "Fluent Swedish speaker")!;
      expect(swedish.missingTerms).toEqual([]);
      expect(swedish.onlyOutsideCv).toBe(true);
      expect(swedish.evidence[0].source).toEqual({
        kind: "portfolio",
        label: "Portfolio: /projects/sv",
        url: "https://alex.example/projects/sv",
      });
    });

    it("caps the statements taken from each portfolio page and in total, and reports what was cut", async () => {
      const many = (prefix: string, n: number) =>
        Array.from({ length: n }, (_, i) => `- ${prefix} project number ${i} shipped`).join("\n");
      const big = [
        { url: "https://alex.example/", title: "Home", text: many("Home", 80) },
        { url: "https://alex.example/a", title: "A", text: many("Alpha", 10) },
        { url: "https://alex.example/b", title: "B", text: many("Beta", 80) },
        { url: "https://alex.example/c", title: "C", text: many("Gamma", 80) },
      ];
      const report = await analyze(jobAd, { cv, portfolio: big }, fakeEmbedder(), { portfolioLimits: { perPage: 50, total: 120 } });
      const perPage = (url: string) => report.statements.filter((s) => s.source.url === url).length;
      expect([perPage("https://alex.example/"), perPage("https://alex.example/a"), perPage("https://alex.example/b")]).toEqual([
        50, 10, 50,
      ]);
      expect(perPage("https://alex.example/c")).toBe(10); // the total limit of 120 is reached
      expect(report.portfolioTrimmed).toBe(true);
    });

    it("does not report trimming when everything fits", async () => {
      const report = await analyze(jobAd, { cv, portfolio: pages }, fakeEmbedder());
      expect(report.portfolioTrimmed).toBe(false);
    });

    it("labels the home page as just 'Portfolio' and keeps a statement found in both the CV and portfolio only once, as CV", async () => {
      const report = await analyze(jobAd, { cv, portfolio: pages }, fakeEmbedder());
      expect(report.statements.filter((s) => s.text === "Led a small team of engineers")).toEqual([
        { text: "Led a small team of engineers", source: CV_SOURCE },
      ]);
      expect(report.statements.find((s) => s.text === "Data engineer building retail data platforms in Helsinki")?.source).toEqual({
        kind: "portfolio",
        label: "Portfolio",
        url: "https://alex.example/",
      });
    });
  });
});
