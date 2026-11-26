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

  it("in Finnish, takes a capitalised first word as a name only when it heads a hyphenated compound", () => {
    expect(keyTerms("Testivetoinen kehitys (TDD) on sinulle tuttua")).toEqual(["TDD"]);
    expect(keyTerms("Infrastruktuuri koodina, esimerkiksi Terraform")).toEqual(["Terraform"]);
    expect(keyTerms("Mobiilisovelluskehitys Kotlinilla")).toEqual(["Kotlinilla"]);
    expect(keyTerms("Angular-osaaminen")).toEqual(["Angular"]);
    expect(keyTerms("Linux-palvelimien ylläpito")).toEqual(["Linux"]);
  });

  it("reports the name, not the whole word, for hyphenated compounds", () => {
    expect(keyTerms("Kokemusta React-käyttöliittymien toteutuksesta")).toEqual(["React"]);
    expect(keyTerms("Kokemusta Java- ja Spring Boot -kehityksestä")).toEqual(["Java", "Spring", "Boot"]);
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

describe("language skills named in Finnish", () => {
  it("reads 'X kielen taito' as the language, by its English name", () => {
    expect(keyTerms("Ruotsin kielen taito")).toEqual(["Swedish"]);
    expect(keyTerms("Sujuva englannin kielen taito")).toEqual(["English"]);
    expect(keyTerms("Erinomainen suomen kielen taito ja ruotsin kielen alkeet")).toEqual(["Finnish", "Swedish"]);
  });

  it("doesn't read a place name as a language", () => {
    expect(keyTerms("Suomen suurin ohjelmistotalo")).toEqual([]);
  });

  it("matches a language whether the CV names it in English or Finnish", () => {
    expect(missingTerms("Ruotsin kielen taito", ["Languages: Finnish (native), English (fluent)"])).toEqual(["Swedish"]);
    expect(missingTerms("Ruotsin kielen taito", ["Kielitaito: suomi, ruotsi, englanti"])).toEqual([]);
    expect(missingTerms("Fluent Swedish", ["Kielitaito: suomi, ruotsi"])).toEqual([]);
    expect(missingTerms("Sujuva englannin kielen taito", ["English (fluent)"])).toEqual([]);
  });
});
