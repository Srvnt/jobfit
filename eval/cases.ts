import type { MatchStatus, Statement } from "../src/core/types";

/**
 * A labelled evaluation set: one fictional candidate (CV + portfolio) and requirements written
 * in the style of real Finnish job ads, each with the status a careful recruiter would give.
 * Labels are judgement calls; the point is to measure changes, not to claim a true accuracy.
 */

const cv = (text: string): Statement => ({ text, source: { kind: "cv", label: "CV" } });
const portfolio = (text: string): Statement => ({ text, source: { kind: "portfolio", label: "Portfolio" } });

export const CANDIDATE: Statement[] = [
  cv("Software Developer at Nordic Logistics Oy since 2023"),
  cv("Full-stack development with Java, Spring Boot and React"),
  cv("Built REST APIs and PostgreSQL schemas for order handling"),
  cv("Deliver features test-first with TDD and JUnit"),
  cv("Set up CI/CD pipelines in GitHub Actions"),
  cv("Deployed services to Azure App Service and AWS Lambda"),
  cv("Docker, Git and AI tools in daily use"),
  cv("Languages and frameworks: Java, Spring Boot, React, TypeScript, Python, SQL"),
  cv("B.Eng. in Information and Communication Technology"),
  cv("Languages: Finnish (native), English (fluent)"),
  cv("Warehouse team lead for six years before moving into software"),
  portfolio("Wrote Terraform modules to provision Azure resources for a side project"),
  portfolio("Monitored services with Grafana dashboards and Prometheus alerts"),
  portfolio("Optimised slow SQL queries with EXPLAIN ANALYZE and new indexes"),
  portfolio("Built a React and TypeScript dashboard for warehouse metrics"),
];

export interface Case {
  requirement: string;
  expected: MatchStatus;
  lang?: "fi";
  /** Why the label is what it is, when it isn't obvious. */
  note?: string;
}

export const CASES: Case[] = [
  // Clearly met, often in different words
  { requirement: "Experience with Java and Spring Boot", expected: "met" },
  { requirement: "Backend development, preferably Java 17+", expected: "met" },
  { requirement: "Experience building user interfaces with React", expected: "met" },
  { requirement: "Strong SQL and PostgreSQL skills", expected: "met" },
  { requirement: "CI/CD pipelines, for example GitHub Actions", expected: "met" },
  { requirement: "Containerisation with Docker", expected: "met" },
  { requirement: "Test-driven development", expected: "met" },
  { requirement: "Cloud experience on Azure or AWS", expected: "met" },
  { requirement: "Fluent spoken and written English", expected: "met" },
  { requirement: "TypeScript in frontend work", expected: "met" },
  { requirement: "Query and index optimisation in PostgreSQL", expected: "met" },
  { requirement: "Infrastructure as code with Terraform", expected: "met" },
  { requirement: "Monitoring with Prometheus and Grafana", expected: "met" },
  { requirement: "Native-level Finnish", expected: "met" },
  { requirement: "Python, Java or TypeScript", expected: "met", note: "alternatives: any one is enough" },
  { requirement: "Degree in computer science or a related field", expected: "met", note: "B.Eng. in ICT" },
  { requirement: "Docker or Podman for containers", expected: "met", note: "alternatives: Docker is enough" },

  // Partly met: related experience, or one of several things
  { requirement: "Experience leading a team", expected: "partial", note: "led a warehouse team, not a software team" },
  { requirement: "Ansible or other infrastructure automation", expected: "partial", note: "Terraform, not Ansible" },
  { requirement: "Datadog or other monitoring tools", expected: "partial", note: "Grafana/Prometheus, not Datadog" },
  { requirement: "PostgreSQL high availability with Patroni", expected: "partial" },
  { requirement: "Experience with Jakarta EE or Quarkus", expected: "partial", note: "Java, but Spring" },
  { requirement: "Frontend development with Angular", expected: "partial", note: "React, not Angular" },
  { requirement: "Azure IoT solutions", expected: "partial", note: "Azure, not IoT" },

  // Not met
  { requirement: "Kubernetes in production", expected: "gap" },
  { requirement: "Linux server administration", expected: "gap" },
  { requirement: "Kafka or other event streaming platforms", expected: "gap" },
  { requirement: "Fluent Swedish", expected: "gap" },
  { requirement: "Go or Rust programming", expected: "gap" },
  { requirement: "SAP ERP configuration", expected: "gap" },
  { requirement: "iOS development with Swift", expected: "gap" },
  { requirement: "Training machine learning models", expected: "gap" },
  { requirement: "Experience with Datadog", expected: "gap" },
  { requirement: "Ansible playbooks for server configuration", expected: "gap" },
  { requirement: "TimescaleDB or other time series databases", expected: "gap" },
  { requirement: "Industrial IoT experience", expected: "gap" },
  { requirement: "C# and .NET development", expected: "gap" },
  { requirement: "Security certifications such as CISSP", expected: "gap" },
  { requirement: "Mobile development with Kotlin", expected: "gap" },

  // Finnish requirements (the model is English-only, so these are expected to be harder)
  {
    requirement: "Vahvaa kokemusta modernista ohjelmistokehityksestä esimerkiksi Pythonilla, Javalla tai TypeScriptillä.",
    expected: "met",
    lang: "fi",
    note: "from a real ad; the CV lists all three",
  },
  { requirement: "Kokemusta PostgreSQL-tietokannoista", expected: "met", lang: "fi" },
  { requirement: "Osaamista Azuren pilvipalveluista", expected: "met", lang: "fi" },
  { requirement: "Kokemusta Kubernetesista", expected: "gap", lang: "fi" },
  { requirement: "Ruotsin kielen taito", expected: "gap", lang: "fi", note: "Swedish" },
  { requirement: "Kokemusta Java- ja Spring Boot -kehityksestä", expected: "met", lang: "fi" },
  { requirement: "Hyvä SQL-osaaminen", expected: "met", lang: "fi" },
  { requirement: "Kokemusta React-käyttöliittymien toteutuksesta", expected: "met", lang: "fi" },
  { requirement: "Testivetoinen kehitys (TDD) on sinulle tuttua", expected: "met", lang: "fi" },
  { requirement: "Kokemusta CI/CD-putkista, esimerkiksi GitHub Actions", expected: "met", lang: "fi" },
  { requirement: "Sujuva englannin kielen taito", expected: "met", lang: "fi" },
  { requirement: "Kokemusta pilvipalveluista, kuten Azure tai AWS", expected: "met", lang: "fi" },
  { requirement: "Kokemusta Dockerista", expected: "met", lang: "fi" },
  { requirement: "Infrastruktuuri koodina, esimerkiksi Terraform", expected: "met", lang: "fi" },
  { requirement: "Kokemusta tiimin johtamisesta", expected: "partial", lang: "fi", note: "led a warehouse team" },
  { requirement: "Angular-osaaminen", expected: "partial", lang: "fi", note: "React, not Angular" },
  { requirement: "Kokemusta koneoppimismallien kouluttamisesta", expected: "gap", lang: "fi" },
  { requirement: "Linux-palvelimien ylläpito", expected: "gap", lang: "fi" },
  { requirement: "SAP-järjestelmien tuntemus", expected: "gap", lang: "fi" },
  { requirement: "Mobiilisovelluskehitys Kotlinilla", expected: "gap", lang: "fi" },
  { requirement: "Kokemusta Kafkasta tai muista tapahtumavirta-alustoista", expected: "gap", lang: "fi" },
];
