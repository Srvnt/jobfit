import { useMemo, useState } from "react";
import { analyze, type Report } from "./core/analyze";
import type { Evidence, MatchStatus, RequirementMatch } from "./core/types";
import { CvInput } from "./cv/CvInput";
import { createBrowserEmbedder } from "./embedder/browserEmbedder";
import { SAMPLE_CV, SAMPLE_JOB_AD } from "./sample";

type Phase = { kind: "idle" } | { kind: "loading"; progress: number } | { kind: "error"; message: string };

const STATUS_LABEL: Record<MatchStatus, string> = { met: "Met", partial: "Partial", gap: "Gap" };
const STATUS_ORDER: MatchStatus[] = ["met", "partial", "gap"];

export function App() {
  const [jobAd, setJobAd] = useState("");
  const [cv, setCv] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Created once; the model downloads on first use and is cached by the browser afterwards.
  const embedder = useMemo(
    () =>
      createBrowserEmbedder((file, progress) => {
        if (file.endsWith(".onnx")) setPhase({ kind: "loading", progress });
      }),
    [],
  );

  async function run() {
    setPhase({ kind: "loading", progress: 0 });
    try {
      setReport(await analyze(jobAd, { cv }, embedder));
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
          Paste a job ad and a CV, or upload the CV as a Word or PDF file. A small AI model matches every requirement to the CV lines that back it up, by
          meaning rather than keywords. <strong>It runs entirely in your browser:</strong> nothing you paste or upload leaves your device.
        </p>
      </header>

      <section className="inputs">
        <div className="field">
          <div className="field-head">
            <label htmlFor="job-ad">Job ad</label>
          </div>
          <textarea id="job-ad" value={jobAd} onChange={(e) => setJobAd(e.target.value)} placeholder="Paste the full job ad…" />
        </div>
        <CvInput value={cv} onChange={setCv} disabled={busy} />
      </section>

      <div className="actions">
        <button className="primary" onClick={run} disabled={busy || !jobAd.trim() || !cv.trim()}>
          {busy ? "Analysing…" : "Analyse fit"}
        </button>
        <button
          onClick={() => {
            setJobAd(SAMPLE_JOB_AD);
            setCv(SAMPLE_CV);
          }}
          disabled={busy}
        >
          Try the sample
        </button>
        {phase.kind === "loading" && phase.progress > 0 && phase.progress < 100 && (
          <span className="muted">Downloading model (one time, ~34 MB): {Math.round(phase.progress)}%</span>
        )}
        {phase.kind === "error" && <span className="error">{phase.message}</span>}
      </div>

      {report && <Results report={report} />}

      <footer className="muted">
        Model: bge-small-en-v1.5 (quantised) via Transformers.js, plus a literal check for named skills. No
        server, no API key.
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
      {match.onlyOutsideCv && (
        <p className="hint small">Only your portfolio shows this. Consider adding it to your CV.</p>
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
