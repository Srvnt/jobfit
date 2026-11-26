import { describe, expect, it } from "vitest";
import { extractRequirements, segment } from "./segment";

describe("segment", () => {
  it("returns an empty list for empty or whitespace input", () => {
    expect(segment("")).toEqual([]);
    expect(segment("   \n\n  ")).toEqual([]);
  });

  it("splits bullet lists into one item per bullet and strips the markers", () => {
    const text = "- Built ETL pipelines in Python\n* Led a team of four engineers\n• Shipped a React dashboard\n1. Wrote unit tests with Jest";
    expect(segment(text)).toEqual([
      "Built ETL pipelines in Python",
      "Led a team of four engineers",
      "Shipped a React dashboard",
      "Wrote unit tests with Jest",
    ]);
  });

  it("splits paragraphs into sentences", () => {
    const text = "I have five years of Python experience. I enjoy mentoring juniors! Do I like testing? Yes, very much so.";
    expect(segment(text)).toEqual([
      "I have five years of Python experience.",
      "I enjoy mentoring juniors!",
      "Do I like testing?",
      "Yes, very much so.",
    ]);
  });

  it("does not split on common abbreviations or decimals", () => {
    const text = "Experience with e.g. Docker and Kubernetes. Improved latency by 2.5 times.";
    expect(segment(text)).toEqual([
      "Experience with e.g. Docker and Kubernetes.",
      "Improved latency by 2.5 times.",
    ]);
  });

  it("drops fragments shorter than three words, such as headings", () => {
    const text = "Experience\n- Built ETL pipelines in Python\nSkills:\n- Python";
    expect(segment(text)).toEqual(["Built ETL pipelines in Python"]);
  });

  it("keeps two-word bullets, common in Finnish, but not two-word plain lines", () => {
    const text = "Osaaminen\n- Kokemusta PostgreSQL-tietokannoista\n- Python\nHyvät tiimitaidot";
    expect(segment(text)).toEqual(["Kokemusta PostgreSQL-tietokannoista"]);
  });

  it("removes duplicates, ignoring case and surrounding whitespace", () => {
    const text = "- Strong SQL skills\n-   strong sql skills  \n- Strong SQL skills";
    expect(segment(text)).toEqual(["Strong SQL skills"]);
  });
});

describe("extractRequirements", () => {
  const ad = [
    "About us",
    "We are a fast-growing fintech company in Helsinki.",
    "",
    "What you bring:",
    "- 3+ years of experience with Python",
    "- Experience building data pipelines",
    "- Good communication skills in English",
    "",
    "We offer:",
    "- Flexible working hours and remote work",
    "- Lunch benefit and sports vouchers",
    "",
    "How to apply",
    "Send your CV to our recruiting team by Friday.",
  ].join("\n");

  it("keeps the requirement sections of a job ad", () => {
    expect(extractRequirements(ad)).toEqual([
      "3+ years of experience with Python",
      "Experience building data pipelines",
      "Good communication skills in English",
    ]);
  });

  it("falls back to every segment when the ad has no headings", () => {
    const plain = "You know TypeScript well. You have shipped production React apps.";
    expect(extractRequirements(plain)).toEqual([
      "You know TypeScript well.",
      "You have shipped production React apps.",
    ]);
  });
});

describe("segment with line-per-item text (as extracted from PDF and Word files)", () => {
  it("treats consecutive capitalised lines without bullets as separate statements", () => {
    const text = "Developed Python services for retail data\nBuilt ETL pipelines in Airflow";
    expect(segment(text)).toEqual(["Developed Python services for retail data", "Built ETL pipelines in Airflow"]);
  });

  it("joins a line that starts in lowercase to the previous one, as a wrapped continuation", () => {
    const text = "I have five years of experience\nin Python and SQL.\n- Built ETL pipelines with Airflow\n  and dbt on BigQuery";
    expect(segment(text)).toEqual([
      "I have five years of experience in Python and SQL.",
      "Built ETL pipelines with Airflow and dbt on BigQuery",
    ]);
  });
});

describe("segment with bullet characters used by Word, LibreOffice and PDF exports", () => {
  it.each(["●", "○", "■", "□", "►", "‣", "·", "➢", "✓", "", ""])("strips the %s marker", (marker) => {
    expect(segment(`${marker} Built ETL pipelines in Python`)).toEqual(["Built ETL pipelines in Python"]);
  });
});

describe("extractRequirements: requirement sections", () => {
  it("keeps only the requirement sections when the ad has them", () => {
    const ad = [
      "Acme builds analytics software for retailers across the Nordics.",
      "Who are we?",
      "We are a team of forty engineers in Helsinki.",
      "We value curiosity and good coffee.",
      "Qualifications",
      "To be successful in this role, we expect that you:",
      "- Have three years of Python experience",
      "- Know SQL and data modelling well",
      "In addition, we consider it an advantage if you have:",
      "- Experience with Kubernetes in production",
      "What we offer",
      "- A hybrid office in central Helsinki",
    ].join("\n");
    expect(extractRequirements(ad)).toEqual([
      "Have three years of Python experience",
      "Know SQL and data modelling well",
      "Experience with Kubernetes in production",
    ]);
  });

  it("recognises Finnish requirement and non-requirement headings, including questions", () => {
    const ad = [
      "Keitä olemme?",
      "Olemme kasvava ohjelmistotalo Tampereella.",
      "Mitä odotamme sinulta?",
      "- Vahvaa osaamista Javasta ja Springistä",
      "- Kokemusta PostgreSQL-tietokannoista",
      "Katsomme eduksi:",
      "- Kokemusta Azuren pilvipalveluista",
      "Mitä tarjoamme sinulle?",
      "- Joustavat työajat ja etätyömahdollisuus",
    ].join("\n");
    expect(extractRequirements(ad)).toEqual([
      "Vahvaa osaamista Javasta ja Springistä",
      "Kokemusta PostgreSQL-tietokannoista",
      "Kokemusta Azuren pilvipalveluista",
    ]);
  });

  it("recognises 'Required' and longer question headings like 'Are you the one we are searching for?'", () => {
    const ad = [
      "Why choose us?",
      "We are a work community of about fifty people.",
      "Are you the one we are searching for?",
      "You have several years of backend development experience.",
      "Required",
      "Strong SQL and PostgreSQL skills in production",
      "Considered an advantage",
      "Docker and Kubernetes experience",
      "We offer",
      "Flexible hours and a sauna in the office",
    ].join("\n");
    expect(extractRequirements(ad)).toEqual([
      "You have several years of backend development experience.",
      "Strong SQL and PostgreSQL skills in production",
      "Docker and Kubernetes experience",
    ]);
  });

  it("ends a requirement section at a prose paragraph that follows its list", () => {
    const ad = [
      "Required",
      "You have several years of backend development experience and enjoy mentoring others.",
      "Strong SQL and PostgreSQL skills",
      "Linux server environments",
      "With your expertise you are part of creating a great customer experience for our industrial clients.",
      "Ideally you are based near our Tampere office and enjoy a strong office culture.",
    ].join("\n");
    expect(extractRequirements(ad)).toEqual([
      "You have several years of backend development experience and enjoy mentoring others.",
      "Strong SQL and PostgreSQL skills",
      "Linux server environments",
    ]);
  });

  it("keeps a lead-in line ending in a colon inside the section it belongs to", () => {
    const ad = "Requirements\n- Five years of backend experience\nTechnical skills:\n- Go and Rust services\nAbout us\n- Founded in 2019 by two engineers";
    expect(extractRequirements(ad)).toEqual(["Five years of backend experience", "Go and Rust services"]);
  });
});
