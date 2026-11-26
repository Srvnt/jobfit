import { useState, type FormEvent } from "react";
import type { PortfolioPage } from "../core/analyze";
import { fetchPagesFromApi } from "./client";
import type { PageMode } from "./fetchPage";

interface Props {
  mode: PageMode;
  label: string;
  placeholder: string;
  buttonLabel?: string;
  disabled?: boolean;
  /** Receives the fetched pages and returns the confirmation to show. */
  onPages: (pages: PortfolioPage[]) => string;
}

type Status = { kind: "idle" } | { kind: "fetching" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/** A one-line "fetch from a link" form, backed by the server-side page fetcher. */
export function LinkFetcher({ mode, label, placeholder, buttonLabel = "Fetch", disabled, onPages }: Props) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fetching = status.kind === "fetching";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "fetching" });
    try {
      setStatus({ kind: "done", message: onPages(await fetchPagesFromApi(url, mode)) });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form className="link-fetcher" onSubmit={submit}>
      <input
        type="text"
        inputMode="url"
        autoComplete="url"
        aria-label={label}
        placeholder={placeholder}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={disabled || fetching}
      />
      <button type="submit" disabled={disabled || fetching || !url.trim()}>
        {fetching ? "Fetching…" : buttonLabel}
      </button>
      {(status.kind === "done" || status.kind === "error") && (
        <p className={`field-note small ${status.kind === "error" ? "error" : "muted"}`} aria-live="polite">
          {status.message}
        </p>
      )}
    </form>
  );
}
