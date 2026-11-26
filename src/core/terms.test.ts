import { describe, expect, it } from "vitest";
import { keyTerms, missingTerms } from "./terms";

describe("keyTerms", () => {
  it("finds capitalised names, acronyms and tech tokens, but not the sentence's first word", () => {
    expect(keyTerms("Fluent Swedish is a plus")).toEqual(["Swedish"]);
    expect(keyTerms("Solid SQL skills on AWS")).toEqual(["SQL", "AWS"]);
    expect(keyTerms("Experience with Node.js, C++ and C# services")).toEqual(["Node.js", "C++", "C#"]);
  });

  it("includes the first word when it names a technology rather than starting a sentence", () => {
    expect(keyTerms("Kubernetes in production")).toEqual(["Kubernetes"]);
    expect(keyTerms("Ansible or other infrastructure automation")).toEqual(["Ansible"]);
    expect(keyTerms("iOS development with Swift")).toEqual(["iOS", "Swift"]);
    expect(keyTerms("Experience with Datadog")).toEqual(["Datadog"]);
    expect(keyTerms("Strong SQL skills")).toEqual(["SQL"]);
    expect(keyTerms("Kokemusta Kubernetesista")).toEqual(["Kubernetesista"]);
    expect(keyTerms("Training machine learning models")).toEqual([]);
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

describe("missingTerms with Finnish inflections and compounds", () => {
  const cv = ["Languages and frameworks: Java, Spring Boot, React, TypeScript, Python, SQL", "Deployed to Azure and PostgreSQL"];

  it("matches a term with a Finnish case ending to its base form", () => {
    expect(
      missingTerms("Vahvaa kokemusta esimerkiksi Pythonilla, Javalla tai TypeScriptillä.", cv),
    ).toEqual([]);
    expect(missingTerms("Osaamista Azuren pilvipalveluista", cv)).toEqual([]);
    expect(missingTerms("Kokemusta AWS:stä ja SQL:n käytöstä", ["Deployed to AWS Lambda", "Wrote SQL"])).toEqual([]);
  });

  it("matches the first part of a hyphenated Finnish compound", () => {
    expect(missingTerms("Kokemusta PostgreSQL-tietokannoista", cv)).toEqual([]);
  });

  it("doesn't treat an English suffix as a Finnish ending", () => {
    expect(missingTerms("Experience with Reactive programming", ["Built apps with React"])).toEqual(["Reactive"]);
    expect(missingTerms("JavaScript experience", ["Ten years of Java"])).toEqual(["JavaScript"]);
  });

  it("still reports a Finnish-inflected term the CV doesn't have", () => {
    expect(missingTerms("Kokemusta Kubernetesista", cv)).toEqual(["Kubernetesista"]);
  });
});
