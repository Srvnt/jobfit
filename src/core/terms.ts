/**
 * Named terms (technologies, languages, certifications) are where embeddings are weakest:
 * "Swedish" and "English" sit close together in embedding space, but a recruiter treats them
 * as completely different skills. These helpers find such terms so they can be checked literally.
 */

const NOT_TERMS = new Set(["I", "We", "You", "Our", "Your", "The", "This", "They"]);

function cleanToken(token: string): string {
  return token.replace(/^[("'[]+/, "").replace(/[.,;:!?)"'\]]+$/, "");
}

function isKeyTerm(word: string): boolean {
  if (word.length < 2 || NOT_TERMS.has(word) || !/^\p{L}/u.test(word)) return false;
  const capitalised = /^\p{Lu}/u.test(word);
  const techSymbol = /[+#]|\w\.\w/.test(word); // C++, C#, Node.js
  return capitalised || techSymbol;
}

/** Capitalised names, acronyms and tech tokens in a statement, excluding its first word. */
export function keyTerms(statement: string): string[] {
  const words = statement.split(/\s+/).map(cleanToken).filter(Boolean);
  return [...new Set(words.slice(1).filter(isKeyTerm))];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Key terms of the requirement that appear nowhere in the CV (whole word, any case). */
export function missingTerms(requirement: string, cvStatements: string[]): string[] {
  const cv = cvStatements.join("\n");
  return keyTerms(requirement).filter(
    (term) => !new RegExp(`(?<![\\w+#.])${escape(term)}(?![\\w+#])`, "iu").test(cv),
  );
}
