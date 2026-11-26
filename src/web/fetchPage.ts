import { extractPage, type ExtractedPage } from "./page.js";
import { assertFetchableUrl } from "./safeUrl.js";

/** The subset of `fetch` used here, so tests can pass a fake website. */
export type FetchLike = (
  url: string,
  init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<Response>;

export interface FetchOptions {
  fetch: FetchLike;
  /** Total time for one page, redirects and body included. */
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface CrawlOptions extends FetchOptions {
  /** Portfolio only: the start page plus up to `maxPages - 1` linked pages. */
  maxPages?: number;
}

export type PageMode = "job" | "portfolio";

/** An error with a user-facing message and the HTTP status the API should answer with. */
export class PageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PageError";
  }
}

const DEFAULTS = { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3, maxPages: 5 };
const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; JobFit/0.1)", accept: "text/html,application/xhtml+xml" };
/** Portfolio pages most likely to describe work, fetched before other links. */
const PROJECT_LIKE = /project|projekt|work|case|portfolio|tyot|cv|resume|experience/i;

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) throw new PageError("The page is too large to read.", 422);
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PageError("The page is too large to read.", 422);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([^;"'\s]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function toPageError(err: unknown, signal: AbortSignal): PageError {
  if (err instanceof PageError) return err;
  if (signal.aborted) return new PageError("The site took too long to respond.", 504);
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "EPRIVATEADDRESS") return new PageError("Only public websites can be fetched.", 400);
  if (code === "ENOTFOUND") return new PageError("That website doesn't exist or can't be found.", 502);
  return new PageError("Could not reach the website.", 502);
}

/** Fetches one HTML page safely: public addresses only, checked redirects, time and size limits. */
export async function fetchHtml(rawUrl: string, options: FetchOptions): Promise<{ url: string; html: string }> {
  const { timeoutMs, maxBytes, maxRedirects } = { ...DEFAULTS, ...options };
  const signal = AbortSignal.timeout(timeoutMs);
  const check = (raw: string) => {
    try {
      return assertFetchableUrl(raw);
    } catch (err) {
      throw new PageError((err as Error).message, 400);
    }
  };

  let url = check(rawUrl);
  try {
    for (let hop = 0; ; hop++) {
      const response = await options.fetch(url.href, { redirect: "manual", signal, headers: HEADERS });

      if (response.status >= 300 && response.status < 400 && response.headers.has("location")) {
        if (hop >= maxRedirects) throw new PageError("The address redirects too many times.", 502);
        url = check(new URL(response.headers.get("location")!, url).href);
        continue;
      }
      if (!response.ok) throw new PageError(`The website answered with an error (HTTP ${response.status}).`, 502);

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new PageError("That address is not a web page.", 422);
      }
      return { url: url.href, html: decode(await readLimited(response, maxBytes), contentType) };
    }
  } catch (err) {
    throw toPageError(err, signal);
  }
}

async function fetchAndExtract(url: string, options: FetchOptions): Promise<ExtractedPage> {
  const { url: finalUrl, html } = await fetchHtml(url, options);
  return extractPage(html, finalUrl);
}

/**
 * Fetches a job ad (one page) or a portfolio (the start page plus a few same-site pages,
 * project-like ones first). Linked pages that fail or have no text are skipped.
 */
export async function fetchPages(rawUrl: string, mode: PageMode, options: CrawlOptions): Promise<ExtractedPage[]> {
  const { maxPages } = { ...DEFAULTS, ...options };
  const start = await fetchAndExtract(rawUrl, options);
  if (!start.text) {
    throw new PageError(
      start.clientRendered
        ? "This site is built with JavaScript and has no readable text without a browser. Paste the text instead."
        : "No readable text was found on that page. Paste the text instead.",
      422,
    );
  }
  if (mode === "job") return [start];

  const isProjectLike = (link: string) => PROJECT_LIKE.test(new URL(link).pathname);
  const ranked = [...start.links.filter(isProjectLike), ...start.links.filter((l) => !isProjectLike(l))];
  const subpages = await Promise.allSettled(ranked.slice(0, maxPages - 1).map((link) => fetchAndExtract(link, options)));
  return [
    start,
    ...subpages.flatMap((r) => (r.status === "fulfilled" && r.value.text ? [r.value] : [])),
  ];
}
