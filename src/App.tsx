import { useMemo, useState } from "react";
import { analyze, type PortfolioPage, type Report } from "./core/analyze";
import { batchedEmbedder } from "./core/batch";
import type { Evidence, MatchStatus, RequirementMatch } from "./core/types";
import { CvInput } from "./cv/CvInput";
import { createBrowserEmbedder } from "./embedder/browserEmbedder";
import { ACTIVE_MODEL } from "./embedder/model";
import { SAMPLE_CV, SAMPLE_JOB_AD } from "./sample";
import { LinkFetcher } from "./web/LinkFetcher";

type Phase = { kind: "idle" } | { kind: "loading"; progress: number } | { kind: "error"; message: string };

const STATUS_LABEL: Record<MatchStatus, string> = { met: "Met", partial: "Partial", gap: "Gap" };
const STATUS_ORDER: MatchStatus[] = ["met", "partial", "gap"];

export function App() {
  const [jobAd, setJobAd] = useState("");
  const [cv, setCv] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioPage[]>([]);
  // For portfolios the fetcher can't read (JavaScript-only sites): pasted text.
  const [portfolioText, setPortfolioText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Created once; the model downloads on first use and is cached by the browser afterwards.
  const embedder = useMemo(
    () =>
      batchedEmbedder(
        createBrowserEmbedder((file, progress) => {
          if (file.endsWith(".onnx")) setPhase({ kind: "loading", progress });
        }),
      ),
    [],
  );

  async function run() {
    setPhase({ kind: "loading", progress: 0 });
    try {
      const pasted = portfolioText.trim() ? [{ title: "Pasted portfolio text", text: portfolioText }] : [];
      setReport(await analyze(jobAd, { cv, portfolio: [...portfolio, ...pasted] }, embedder));
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const busy = phase.kind === "loading";

  return (
    <main>
      <header>
        <h1>JobFit</h1>
        <p className="lede">
          Give a job ad and your CV, and optionally your portfolio site. A small AI model matches every requirement to
          the lines that back it up, by meaning rather than keywords. <strong>The AI runs in your browser:</strong> your
          CV never leaves your device.
        </p>
      </header>

      <section className="inputs">
        <div className="field">
          <div className="field-head">
            <label htmlFor="job-ad">Job ad</label>
          </div>
          <LinkFetcher
            mode="job"
            label="Job ad address"
            placeholder="Link to the job ad, e.g. https://…"
            disabled={busy}
            onPages={([page]) => {
              setJobAd(page.text);
              return `Fetched "${page.title}". Remove anything below that isn't part of the ad.`;
            }}
          />
          <textarea id="job-ad" value={jobAd} onChange={(e) => setJobAd(e.target.value)} placeholder="…or paste the full job ad" />
        </div>
        <CvInput value={cv} onChange={setCv} disabled={busy} />
        <div className="field portfolio">
          <div className="field-head">
            <span className="label">
              Portfolio <span className="muted">(optional)</span>
            </span>
            {portfolio.length > 0 && (
              <button type="button" className="link" onClick={() => setPortfolio([])} disabled={busy}>
                Remove
              </button>
            )}
          </div>
          <LinkFetcher
            mode="portfolio"
            label="Portfolio address"
            placeholder="Your portfolio site, e.g. yourname.dev"
            buttonLabel="Add"
            disabled={busy}
            onPages={(pages) => {
              setPortfolio(pages);
              return `Read ${pages.length} ${pages.length === 1 ? "page" : "pages"}. They're used as extra evidence alongside the CV.`;
            }}
          />
          {portfolio.length > 0 && (
            <ul className="pages small">
              {portfolio.map((p) => (
                <li key={p.url}>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.title || p.url}
                  </a>{" "}
                  {p.url && <span className="muted">{new URL(p.url).pathname}</span>}
                </li>
              ))}
            </ul>
          )}
          <textarea
            className="short"
            aria-label="Portfolio text"
            value={portfolioText}
            onChange={(e) => setPortfolioText(e.target.value)}
            placeholder="…or paste text from your portfolio (project descriptions, skills). Useful when the site is built with JavaScript and can't be read from a link."
            disabled={busy}
          />
        </div>
      </section>

      <div className="actions">
        <button className="primary" onClick={run} disabled={busy || !jobAd.trim() || !cv.trim()}>
          {busy ? "Analysing…" : "Analyse fit"}
        </button>
        <button
          onClick={() => {
            setJobAd(SAMPLE_JOB_AD);
            setCv(SAMPLE_CV);
            setPortfolio([]);
            setPortfolioText("");
          }}
          disabled={busy}
        >
          Try the sample
        </button>
        {phase.kind === "loading" && phase.progress > 0 && phase.progress < 100 && (
          <span className="muted">Downloading the AI model (one time, ~{ACTIVE_MODEL.sizeMB} MB): {Math.round(phase.progress)}%</span>
        )}
        {phase.kind === "error" && <span className="error">{phase.message}</span>}
      </div>

      {report && <Results report={report} />}

      <footer className="muted">
        Model: {ACTIVE_MODEL.id.split("/")[1]} (quantised, English and Finnish) via Transformers.js, plus a literal
        check for named skills. No API key. Links are read by a small server function; the CV is never uploaded.
      </footer>
    </main>
  );
}

function Results({ report }: { report: Report }) {
  const { summary } = report;
  const statementCount = (kind: Evidence["source"]["kind"]) => report.statements.filter((s) => s.source.kind === kind).length;
  const portfolioLines = statementCount("portfolio");
  // Source tags only help when there is more than one source.
  const showSources = portfolioLines > 0;
  const sorted = [...report.matches].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.score - a.score,
  );

  return (
    <section className="results" aria-live="polite">
      <div className="summary">
        <div className="coverage">
          <span className="big">{summary.coverage}%</span>
          <span className="muted">coverage</span>
        </div>
        <ul className="counts">
          <li><span className="dot met" /> {summary.met} met</li>
          <li><span className="dot partial" /> {summary.partial} partial</li>
          <li><span className="dot gap" /> {summary.gaps} gaps</li>
        </ul>
        <span className="muted small">
          {summary.total} requirements × {statementCount("cv")} CV lines
          {portfolioLines > 0 && ` + ${portfolioLines} portfolio lines`} in {Math.round(report.elapsedMs)} ms
        </span>
        {report.portfolioTrimmed && (
          <span className="muted small">
            The portfolio has a lot of text, so only the first part of each page was used.
          </span>
        )}
      </div>

      <ol className="matches">
        {sorted.map((m) => (
          <MatchCard key={m.requirement} match={m} showSources={showSources} />
        ))}
      </ol>
    </section>
  );
}

function SourceTag({ source }: { source: Evidence["source"] }) {
  return source.url ? (
    <a className={`source ${source.kind}`} href={source.url} target="_blank" rel="noreferrer">
      {source.label}
    </a>
  ) : (
    <span className={`source ${source.kind}`}>{source.label}</span>
  );
}

function MatchCard({ match, showSources }: { match: RequirementMatch; showSources: boolean }) {
  return (
    <li className={`card ${match.status}`}>
      <div className="card-head">
        <span className={`badge ${match.status}`}>{STATUS_LABEL[match.status]}</span>
        <span className="requirement">{match.requirement}</span>
      </div>
      {match.missingTerms.length > 0 && (
        <p className="missing small">
          {showSources ? "Not mentioned in the CV or portfolio" : "Not mentioned in the CV"}:{" "}
          <strong>{match.missingTerms.join(", ")}</strong>
        </p>
      )}
      {match.cvAloneWeaker && (
        <p className="hint small">Your portfolio shows this better than your CV does. Consider adding it to your CV.</p>
      )}
      {match.evidence.length > 0 ? (
        <ul className="evidence">
          {match.evidence.map((e) => (
            <li key={e.text} className={showSources ? "with-source" : undefined}>
              <span className="bar" aria-hidden>
                <span style={{ width: `${Math.max(0, e.score) * 100}%` }} />
              </span>
              <span className="score">{e.score.toFixed(2)}</span>
              <span>{e.text}</span>
              {showSources && <SourceTag source={e.source} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          {showSources ? "Nothing in the CV or portfolio supports this" : "Nothing in the CV supports this"} (closest match {match.score.toFixed(2)}). Address it in a cover letter if you can.
        </p>
      )}
    </li>
  );
}
