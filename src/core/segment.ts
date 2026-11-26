/**
 * Splits free text (a CV or a job ad) into short, self-contained statements
 * that can each be embedded and compared on their own.
 */

const BULLET = /^\s*(?:[-*•▪◦–●○■□►‣·➢✓\uF0B7\uF0A7]|\d+[.)])\s+/u;
const MIN_WORDS = 3;

/** Words that end in a period but do not end a sentence. */
const ABBREVIATIONS = new Set([
  "e.g.", "i.e.", "etc.", "vs.", "approx.", "incl.", "esp.", "mr.", "mrs.", "ms.", "dr.", "jr.", "sr.", "no.",
]);

/** Section headings in a job ad whose content is not a requirement. */
const NON_REQUIREMENT_HEADING =
  /\b(about (us|the company)|who we are|we offer|what we offer|benefits|perks|how to apply|contact|salary|compensation)\b/i;

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
  return wordCount(trimmed) <= 4 && !/[.!?]$/.test(trimmed);
}

interface Line {
  text: string;
  heading: string | null;
}

/**
 * Groups the text into logical lines, tagged with their section heading. Every bullet and every
 * capitalised line starts a new item, since CVs (especially ones extracted from PDF or Word)
 * often list items one per line without punctuation. A line starting in lowercase continues
 * the previous item, because it is almost always a wrapped line.
 */
function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let heading: string | null = null;
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
      current = { text: line.replace(BULLET, ""), heading };
    } else if (current && /^\p{Ll}/u.test(line)) {
      current.text += " " + line;
    } else if (isHeading(line)) {
      close();
      heading = line.replace(/:$/, "");
    } else {
      close();
      current = { text: line, heading };
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
      if (wordCount(clean) < MIN_WORDS || seen.has(key)) continue;
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
 * Like `segment`, but drops job-ad sections that are not requirements
 * ("About us", "We offer", "How to apply" and so on).
 */
export function extractRequirements(jobAd: string): string[] {
  const relevant = toLines(jobAd).filter((l) => l.heading === null || !NON_REQUIREMENT_HEADING.test(l.heading));
  return toStatements(relevant);
}
