import { cosineSimilarity } from "./match";
import type { Embedder } from "./types";

/**
 * Zero-shot line classification with the same embedding model: a job-ad line is kept when it is
 * closer to examples of requirements than to examples of everything else an ad (or the page around
 * it) contains. This catches what heading rules can't: ads without headings, odd headings, and
 * page text that slipped through ("Share this job", "Location: Helsinki", "Apply by Friday").
 */

export const REQUIREMENT_EXAMPLES = [
  "Experience with Java and Spring Boot",
  "Several years of experience in backend development",
  "Good knowledge of SQL and relational databases",
  "Fluent spoken and written English",
  "A degree in computer science or a related field",
  "Experience with cloud services such as AWS or Azure",
  "Strong communication and teamwork skills",
  "Familiarity with agile methods and CI/CD",
  "Knowledge of the energy industry is considered an advantage",
  "Experience with GraphQL is a plus",
  "Familiarity with testing frameworks is nice to have",
  "You are able to work independently and take ownership",
  "Kokemusta ohjelmistokehityksestä Javalla tai Pythonilla",
  "Hyvä SQL-osaaminen ja tietokantojen tuntemus",
  "Sujuva suomen ja englannin kielen taito",
  "Soveltuva korkeakoulututkinto",
  "Kokemusta pilvipalveluista on eduksi",
  "Kokemus Kubernetesista on plussaa",
  "Olet oma-aloitteinen ja sinulla on hyvät vuorovaikutustaidot",
];

export const OTHER_EXAMPLES = [
  "We offer flexible working hours, lunch and sports benefits",
  "Our company was founded in 1998 and employs 500 people in Finland",
  "Send your application and CV through our careers page by Friday",
  "The recruitment process is handled by our recruitment partner",
  "For more information, contact our recruiter by email",
  "Start date: in January or as agreed",
  "Location: Helsinki, hybrid work possible",
  "Salary range 4000–5000 euros per month",
  "You will develop new features and maintain our product",
  "You will join a team of eleven developers",
  "We are looking for a backend developer to join our growing team",
  "Acme is a fast-growing software company based in Tampere",
  "Share this job on social media",
  "Similar jobs you might be interested in",
  "Tarjoamme joustavat työajat ja hyvät työsuhde-edut",
  "Olemme kasvava ohjelmistotalo Tampereella",
  "Haemme joukkoomme ohjelmistokehittäjää",
  "Lisätietoja tehtävästä antaa rekrytointikonsultti",
  "Hae paikkaa viimeistään 15.12. hakulomakkeella",
  "Työtehtäviisi kuuluu järjestelmien kehittäminen ja ylläpito",
  "Työsuhde on vakituinen ja kokoaikainen",
  "Meillä on rento ja yhteisöllinen työilmapiiri",
  "Työkaverit ovat mukavia ja järjestämme yhteisiä tapahtumia",
  "Tehtävässä työskennellään hybridimallilla pääkaupunkiseudulla",
];

export interface LineFilterOptions {
  requirementExamples?: string[];
  otherExamples?: string[];
  /**
   * Keep a line when (best requirement similarity − best other similarity) is above this.
   * −0.05 kept every requirement on the labelled ads (eval/extraction-results.txt); an extra
   * line costs less than a missed requirement, and the dropped lines are shown to the user.
   */
  margin?: number;
}

export interface LineFilterResult {
  kept: string[];
  dropped: string[];
}

const best = (vector: number[], examples: number[][]) => Math.max(...examples.map((e) => cosineSimilarity(vector, e)));

export async function filterRequirementLines(
  lines: string[],
  embedder: Embedder,
  { requirementExamples = REQUIREMENT_EXAMPLES, otherExamples = OTHER_EXAMPLES, margin = -0.05 }: LineFilterOptions = {},
): Promise<LineFilterResult> {
  if (lines.length === 0) return { kept: [], dropped: [] };

  const vectors = await embedder.embed([...lines, ...requirementExamples, ...otherExamples], "passage");
  const lineVectors = vectors.slice(0, lines.length);
  const requirementVectors = vectors.slice(lines.length, lines.length + requirementExamples.length);
  const otherVectors = vectors.slice(lines.length + requirementExamples.length);

  const kept: string[] = [];
  const dropped: string[] = [];
  lines.forEach((line, i) => {
    const score = best(lineVectors[i], requirementVectors) - best(lineVectors[i], otherVectors);
    (score > margin ? kept : dropped).push(line);
  });

  // An ad where nothing looks like a requirement is more likely a miss than an ad without any.
  return kept.length > 0 ? { kept, dropped } : { kept: lines, dropped: [] };
}
