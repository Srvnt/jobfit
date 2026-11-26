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

const stripPunctuation = (token: string) => token.replace(/^[("'[]+/, "").replace(/[.,;:!?)"'\]]+$/, "");

/**
 * Reduces a token to the name it carries. In Finnish, a compound joined to a name with a hyphen
 * keeps just the name ("React-käyttöliittymien" → React, "Java-" → Java); English hyphenated
 * words ("Hands-on", "Full-stack") stay whole.
 */
function cleanToken(token: string, finnish: boolean): string {
  const bare = stripPunctuation(token);
  if (!finnish) return bare;
  const compound = /^([^-]+)-\p{Ll}/u.exec(bare);
  return compound ? compound[1] : bare.replace(/-+$/, "");
}

/** Finnish signals: å/ä/ö, or common function words and case endings. */
const FINNISH =
  /[äöå]|\b(ja|tai|sinulla|sinulle|esimerkiksi|kuten|kokemus|kokemusta|osaaminen|osaamista|tuntemus|ylläpito|kehitys)\b|\p{L}(lla|llä|ssa|ssä|sta|stä|lta|ltä)\b/iu;

/**
 * Whether a requirement's first word names something. In English lists it usually does
 * ("Kubernetes in production") unless it's a common opener. Finnish capitalises any first word
 * but joins names to compounds with a hyphen ("Linux-palvelimien", "SQL-osaaminen") and ordinary
 * words without one ("Mobiilisovelluskehitys"), so there only hyphen heads and acronyms count.
 */
function firstWordIsName(rawFirst: string, first: string, finnish: boolean): boolean {
  if (!isKeyTerm(first) || SENTENCE_STARTERS.has(first.toLowerCase())) return false;
  if (!finnish) return true;
  const hyphenHead = first !== stripPunctuation(rawFirst);
  const acronymOrTech = /^\p{Lu}{2,}|\p{Ll}\p{Lu}|[+#]|\w\.\w/u.test(first);
  return hyphenHead || acronymOrTech;
}

function isKeyTerm(word: string): boolean {
  if (word.length < 2 || NOT_TERMS.has(word) || !/^\p{L}/u.test(word)) return false;
  const capitalised = /^\p{Lu}/u.test(word);
  const mixedCase = /\p{Ll}\p{Lu}/u.test(word); // iOS, macOS, jQuery
  const techSymbol = /[+#]|\w\.\w/.test(word); // C++, C#, Node.js
  return capitalised || mixedCase || techSymbol;
}

/**
 * Languages, by English name: the Finnish genitive used in "ruotsin kielen taito" and the stem
 * that starts every Finnish form of the word (ruotsi, ruotsia, ruotsiksi…).
 */
const LANGUAGES: { en: string; genitive: string; stem: RegExp }[] = [
  { en: "Swedish", genitive: "ruotsin", stem: /^ruotsi/ },
  { en: "English", genitive: "englannin", stem: /^engla(nn|nt)i/ },
  { en: "Finnish", genitive: "suomen", stem: /^suom(i|e)/ },
  { en: "German", genitive: "saksan", stem: /^saksa/ },
  { en: "French", genitive: "ranskan", stem: /^ranska/ },
  { en: "Russian", genitive: "venäjän", stem: /^venäjä/ },
  { en: "Spanish", genitive: "espanjan", stem: /^espanja/ },
  { en: "Estonian", genitive: "viron", stem: /^viro(n|a|ksi)?$/ },
  { en: "Norwegian", genitive: "norjan", stem: /^norja/ },
  { en: "Danish", genitive: "tanskan", stem: /^tanska/ },
];

/** Languages required in Finnish ("ruotsin kielen taito" → Swedish); a bare "Suomen" (Finland's) doesn't count. */
function finnishLanguageTerms(statement: string): string[] {
  const words = statement.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  return words.flatMap((word, i) => {
    const lang = LANGUAGES.find((l) => l.genitive === word);
    return lang && words[i + 1]?.startsWith("kiel") ? [lang.en] : [];
  });
}

/** Capitalised names, acronyms and tech tokens in a statement; the first word only if it isn't a common opener. */
export function keyTerms(statement: string): string[] {
  const finnish = FINNISH.test(statement);
  const raw = statement.split(/\s+/).filter((t) => cleanToken(t, finnish));
  const words = raw.map((t) => cleanToken(t, finnish));
  const [first, ...rest] = words;
  const firstIsName = first !== undefined && firstWordIsName(raw[0], first, finnish);
  return [...new Set([...(firstIsName ? [first] : []), ...rest.filter(isKeyTerm), ...finnishLanguageTerms(statement)])];
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
  // A language counts whether the CV names it in English or in Finnish ("Swedish" or "ruotsi").
  const language = LANGUAGES.find((lang) => lang.en.toLowerCase() === term.toLowerCase());
  if (language && words.some((word) => language.stem.test(word.toLowerCase()))) return true;
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
