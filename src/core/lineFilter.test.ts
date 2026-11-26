import { describe, expect, it } from "vitest";
import { filterRequirementLines } from "./lineFilter";
import { fakeEmbedder } from "./testing";

const examples = {
  requirementExamples: ["Experience with Java and Python programming", "Good SQL database skills"],
  otherExamples: ["We offer flexible working hours and lunch benefits", "Send your application by Friday"],
};

describe("filterRequirementLines", () => {
  it("keeps lines that resemble requirements and drops lines that resemble everything else", async () => {
    const result = await filterRequirementLines(
      [
        "Experience with Python and Java services",
        "We offer flexible hours and a lunch benefit",
        "Strong SQL database design skills",
        "Send your application and CV by Friday",
      ],
      fakeEmbedder(),
      examples,
    );
    expect(result.kept).toEqual(["Experience with Python and Java services", "Strong SQL database design skills"]);
    expect(result.dropped).toEqual(["We offer flexible hours and a lunch benefit", "Send your application and CV by Friday"]);
  });

  it("keeps every line rather than none when nothing looks like a requirement", async () => {
    const lines = ["We offer flexible hours", "Send your application by Friday"];
    expect(await filterRequirementLines(lines, fakeEmbedder(), examples)).toEqual({ kept: lines, dropped: [] });
  });

  it("returns empty results for no lines without calling the model", async () => {
    const embedder = fakeEmbedder();
    expect(await filterRequirementLines([], embedder, examples)).toEqual({ kept: [], dropped: [] });
    expect(embedder.calls).toEqual([]);
  });

  it("can be made stricter or looser with a margin", async () => {
    const lines = ["Experience with Python and Java services", "Python developers get flexible hours"];
    const strict = await filterRequirementLines(lines, fakeEmbedder(), { ...examples, margin: 0.3 });
    expect(strict.kept).toEqual(["Experience with Python and Java services"]);
    const loose = await filterRequirementLines(lines, fakeEmbedder(), { ...examples, margin: -1 });
    expect(loose.kept).toEqual(lines);
  });
});
