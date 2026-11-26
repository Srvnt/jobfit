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
