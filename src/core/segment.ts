/**
 * Splits free text (a CV or a job ad) into short, self-contained statements
 * that can each be embedded and compared on their own.
 */

const BULLET = /^\s*(?:[-*•▪◦–●○■□►‣·➢✓\uF0B7\uF0A7]|\d+[.)])\s+/u;
/** Plain lines need three words to tell them from headings; a bullet is an item by design, and
 * Finnish packs a lot into two words ("Kokemusta PostgreSQL-tietokannoista"). */
const MIN_WORDS = 3;
const MIN_BULLET_WORDS = 2;
/** In a job ad, a line this long after a requirement list is prose, not a list item. */
const PROSE_WORDS = 12;

/** Words that end in a period but do not end a sentence. */
const ABBREVIATIONS = new Set([
  "e.g.", "i.e.", "etc.", "vs.", "approx.", "incl.", "esp.", "mr.", "mrs.", "ms.", "dr.", "jr.", "sr.", "no.",
]);

/** Job ad section headings whose content is not a requirement (English and Finnish). */
const NON_REQUIREMENT_HEADING =
  /\b(about (us|the company)|who (we are|are we)|we offer|what we offer|benefits|perks|how to apply|contact|salary|compensation)\b|tarjoamme|keitä olemme|keitä me olemme|meistä|yrityksestä|hakeminen|hakuprosessi|näin haet|palkka|\bedut\b|työsuhde-edut|yhteystied|lisätiedot/i;

/** Job ad section headings that introduce requirements (English and Finnish). */
const REQUIREMENT_HEADING =
  /require|qualification|searching for|looking for|are you the one|what you('ll)? (bring|have|need)|what we('re| are)? (expect|look(ing)? for)|we expect|you have|you bring|your (profile|skills|background|experience)|skills|must[- ]haves?|nice[- ]to[- ]haves?|advantage|bonus|competenc|vaatimu|odotamme|edellytämme|toivomme|sinulla on|osaami|profiili|eduksi|pätevyy|kokemus/i;

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Splits a paragraph into sentences without breaking on abbreviations or decimals. */
function splitSentences(paragraph: string): string[] {
  const sentences: string[] = [];
  const tokens = paragraph.split(/\s+/).filter(Boolean);
  let current: string[] = [];

  tokens.forEach((token, i) => {
    current.push(token);
    const next = tokens[i + 1];
    const endsSentence = /[.!?]["')\]]?$/.test(token) && !ABBREVIATIONS.has(token.toLowerCase());
    if (endsSentence && next !== undefined && /^["'(]?[\p{Lu}\d]/u.test(next)) {
      sentences.push(current.join(" "));
      current = [];
    }
  });
  if (current.length) sentences.push(current.join(" "));
  return sentences;
}

function isHeading(line: string): boolean {
  if (BULLET.test(line)) return false;
  const trimmed = line.trim();
  if (trimmed.endsWith(":")) return true;
  if (trimmed.endsWith("?")) return wordCount(trimmed) <= 8; // "Who are we?", "Are you the one we are searching for?"
  return wordCount(trimmed) <= 4 && !/[.!?]$/.test(trimmed);
}

/** Whether a heading-like line clearly opens a new section rather than being a short list item. */
const startsNewSection = (line: string) =>
  /[:?]$/.test(line.trim()) || REQUIREMENT_HEADING.test(line) || NON_REQUIREMENT_HEADING.test(line);

/** What kind of job-ad section a line sits in; null before the first heading. */
type SectionKind = "requirement" | "other" | null;

interface Line {
  text: string;
  heading: string | null;
  section: SectionKind;
  bullet: boolean;
}

/**
 * The section kind after a heading. A lead-in ending in a colon ("Technical skills:", "In addition,
 * we consider it an advantage if you have:") that names nothing else stays in the current section.
 */
function nextSection(current: SectionKind, heading: string): SectionKind {
  if (NON_REQUIREMENT_HEADING.test(heading)) return "other";
  if (REQUIREMENT_HEADING.test(heading)) return "requirement";
  return heading.trim().endsWith(":") && current === "requirement" ? "requirement" : "other";
}

/**
 * Groups the text into logical lines, tagged with their section heading. Every bullet and every
 * capitalised line starts a new item, since CVs (especially ones extracted from PDF or Word)
 * often list items one per line without punctuation. A line starting in lowercase continues
 * the previous item, because it is almost always a wrapped line.
 */
function toLines(text: string, { jobAd = false } = {}): Line[] {
  const lines: Line[] = [];
  let heading: string | null = null;
  let section: SectionKind = null;
  let sectionHasItems = false;
  let current: Line | null = null;

  const close = () => {
    if (current) lines.push(current);
    current = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      close();
    } else if (BULLET.test(line)) {
      close();
      current = { text: line.replace(BULLET, ""), heading, section, bullet: true };
      sectionHasItems = true;
    } else if (current && /^\p{Ll}/u.test(line)) {
      current.text += " " + line;
    } else if (isHeading(line) && !(jobAd && section === "requirement" && !startsNewSection(line))) {
      close();
      heading = line.replace(/:$/, "");
      section = nextSection(section, line);
      sectionHasItems = false;
    } else {
      close();
      // Inside a requirement section, a short line is a list item that lost its bullet
      // (job sites' structured data is often plain text): "Linux server environments".
      const implicitItem = jobAd && section === "requirement" && isHeading(line);
      // A prose paragraph after a requirement list means the ad has moved on ("Ideally you are
      // based near our office…"), even without a heading in between.
      if (jobAd && section === "requirement" && sectionHasItems && !implicitItem && wordCount(line) >= PROSE_WORDS) {
        section = "other";
      }
      current = { text: line, heading, section, bullet: implicitItem };
      if (implicitItem) sectionHasItems = true;
    }
  }
  close();
  return lines;
}

function toStatements(lines: Line[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    for (const sentence of splitSentences(line.text)) {
      const clean = sentence.trim();
      const key = clean.toLowerCase().replace(/\s+/g, " ");
      if (wordCount(clean) < (line.bullet ? MIN_BULLET_WORDS : MIN_WORDS) || seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

/** Splits any text into deduplicated statements of at least three words. */
export function segment(text: string): string[] {
  return toStatements(toLines(text));
}

/**
 * Like `segment`, but for a job ad: keeps only the requirement sections when the ad has headings
 * for them, and otherwise drops the sections that are clearly not requirements ("About us",
 * "We offer", "How to apply" and their Finnish equivalents).
 */
export function extractRequirements(jobAd: string): string[] {
  const lines = toLines(jobAd, { jobAd: true });
  // When the ad labels its requirements ("Qualifications", "Mitä odotamme sinulta?"), trust that.
  if (lines.some((l) => l.section === "requirement")) {
    return toStatements(lines.filter((l) => l.section === "requirement"));
  }
  return toStatements(lines.filter((l) => l.heading === null || !NON_REQUIREMENT_HEADING.test(l.heading)));
}
