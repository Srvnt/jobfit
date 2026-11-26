import { describe, expect, it } from "vitest";
import { keyTerms, missingTerms } from "./terms";

describe("keyTerms", () => {
  it("finds capitalised names, acronyms and tech tokens, but not the sentence's first word", () => {
    expect(keyTerms("Fluent Swedish is a plus")).toEqual(["Swedish"]);
    expect(keyTerms("Solid SQL skills on AWS")).toEqual(["SQL", "AWS"]);
    expect(keyTerms("Experience with Node.js, C++ and C# services")).toEqual(["Node.js", "C++", "C#"]);
  });

  it("returns nothing for a requirement made only of ordinary words", () => {
    expect(keyTerms("Experience building and maintaining data pipelines")).toEqual([]);
  });

  it("ignores pronouns and single letters", () => {
    expect(keyTerms("Tell us what I or A team built")).toEqual([]);
  });
});

describe("missingTerms", () => {
  const cv = ["Built ETL pipelines in python and SQL", "Languages: Finnish (native), English (fluent)"];

  it("lists the key terms that appear nowhere in the CV, ignoring case", () => {
    expect(missingTerms("Fluent Swedish and Python skills", cv)).toEqual(["Swedish"]);
  });

  it("matches whole words only", () => {
    expect(missingTerms("Experience with Go services", ["Good at going fast"])).toEqual(["Go"]);
  });

  it("returns an empty list when every key term is present", () => {
    expect(missingTerms("Good SQL and English skills", cv)).toEqual([]);
  });
});
