/**
 * Named terms (technologies, languages, certifications) are where embeddings are weakest:
 * "Swedish" and "English" sit close together in embedding space, but a recruiter treats them
 * as completely different skills. These helpers find such terms so they can be checked literally.
 */

const NOT_TERMS = new Set(["I", "We", "You", "Our", "Your", "The", "This", "They"]);

/**
 * Words that commonly start a requirement without naming anything ("Experience with…",
 * "Strong…", "Kokemusta…"). Any other capitalised first word is treated as a name, because in
 * requirement lists the first word is often the skill itself ("Kubernetes in production").
 */
const SENTENCE_STARTERS = new Set(
  `experience experienced knowledge strong solid good great excellent fluent fluency proven hands-on familiarity
  familiar understanding ability able background degree bachelor's master's bachelor master have has having are is be
  backend back-end frontend front-end full-stack fullstack cloud containerisation containerization test-driven testing
  tests query queries infrastructure monitoring native native-level training security mobile web software data database
  databases project projects professional several relevant basic deep working practical previous prior some any other
  additional proficiency proficient passion interest interested curiosity curious senior junior technical agile
  communication team teamwork leadership leading lead led building build built developing develop developed development
  designing design designed writing write maintaining maintain maintained work worked creating create using use used
  modern industrial production server servers distributed microservices performance advanced analytical problem-solving
  self-driven motivation motivated willingness eagerness certification certifications certified programming coding
  at least minimum years year ideally preferably also plus bonus nice must should will can tell show help join please
  apply send excellent
  vahvaa vahva kokemusta kokemus osaamista osaaminen hyvä hyvät hyvää erinomainen erinomaiset sujuva sujuvaa
  tuntemusta ymmärrystä kiinnostusta halu valmius soveltuva korkeakoulututkinto tutkinto ruotsin englannin suomen
  saksan kyky kykyä taito taitoa näyttöä aiempaa aikaisempaa käytännön syvällistä perehtyneisyyttä`
    .split(/\s+/)
    .filter(Boolean),
);

function cleanToken(token: string): string {
  return token.replace(/^[("'[]+/, "").replace(/[.,;:!?)"'\]]+$/, "");
}

function isKeyTerm(word: string): boolean {
  if (word.length < 2 || NOT_TERMS.has(word) || !/^\p{L}/u.test(word)) return false;
  const capitalised = /^\p{Lu}/u.test(word);
  const mixedCase = /\p{Ll}\p{Lu}/u.test(word); // iOS, macOS, jQuery
  const techSymbol = /[+#]|\w\.\w/.test(word); // C++, C#, Node.js
  return capitalised || mixedCase || techSymbol;
}

/** Capitalised names, acronyms and tech tokens in a statement; the first word only if it isn't a common opener. */
export function keyTerms(statement: string): string[] {
  const words = statement.split(/\s+/).map(cleanToken).filter(Boolean);
  const [first, ...rest] = words;
  const firstIsName = first !== undefined && !SENTENCE_STARTERS.has(first.toLowerCase()) && isKeyTerm(first);
  return [...new Set([...(firstIsName ? [first] : []), ...rest.filter(isKeyTerm)])];
}

/**
 * Finnish case endings (Java-lla, Python-illa, Azure-n, Spring-istä). Only these are accepted
 * after a base form, so English words that merely start alike ("Reactive", "JavaScript") don't match.
 */
const FINNISH_ENDING =
  /^(?:i?(?:n|a|ä|ta|tä|lla|llä|lta|ltä|lle|ssa|ssä|sta|stä|ksi|na|nä|in|ja|jä|hin|ihin)|en|an|on|un|iin|ien|ää|aa)$/u;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The forms of a term worth looking for: "PostgreSQL-tietokannoista" → PostgreSQL, "AWS:stä" → AWS. */
function baseForms(term: string): string[] {
  const forms = new Set([term]);
  for (const separator of ["-", ":"]) {
    const head = term.split(separator)[0];
    if (head.length >= 2 && head !== term) forms.add(head);
  }
  return [...forms];
}

function mentioned(term: string, text: string, words: string[]): boolean {
  return baseForms(term).some((form) => {
    if (new RegExp(`(?<![\\w+#.])${escape(form)}(?![\\w+#])`, "iu").test(text)) return true;
    const lower = form.toLowerCase();
    return words.some((word) => {
      const base = word.toLowerCase();
      return base.length >= 2 && lower.startsWith(base) && FINNISH_ENDING.test(lower.slice(base.length));
    });
  });
}

/** Key terms of the requirement that appear nowhere in the given statements (whole word, any case, Finnish endings allowed). */
export function missingTerms(requirement: string, statements: string[]): string[] {
  const text = statements.join("\n");
  const words = [...new Set(text.split(/[^\p{L}\p{N}+#.]+/u).map((w) => w.replace(/\.+$/, "")).filter(Boolean))];
  return keyTerms(requirement).filter((term) => !mentioned(term, text, words));
}
