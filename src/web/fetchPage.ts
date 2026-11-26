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

/**
 * Loads a page in a headless browser and returns the HTML after its JavaScript has run, plus
 * optionally the browser's own visible text, which knows how CSS lays elements out into lines.
 */
export type Renderer = (url: string) => Promise<{ url: string; html: string; text?: string }>;

export interface CrawlOptions extends FetchOptions {
  /** Portfolio only: the start page plus up to `maxPages - 1` linked pages. */
  maxPages?: number;
  /** Used only for pages that turn out to be JavaScript apps with no server-rendered text. */
  render?: Renderer;
  /** At most this many pages are rendered in the browser per request (it's the slow path). */
  maxRenders?: number;
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

const DEFAULTS = { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3, maxPages: 5, maxRenders: 3 };
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
      if ([401, 403, 429].includes(response.status)) {
        // Common on job sites, which often block cloud servers. Don't try to get around it.
        throw new PageError("This site blocks automated access. Copy the text from the page and paste it instead.", 502);
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

type LoadedPage = ExtractedPage & { rendered: boolean };

/** Fetches a page; if it turns out to be a JavaScript app, renders it in the browser (within budget). */
async function loadPage(url: string, options: CrawlOptions, budget: { renders: number }): Promise<LoadedPage> {
  const page = await fetchAndExtract(url, options);
  if (!page.clientRendered || !options.render || budget.renders <= 0) return { ...page, rendered: false };
  budget.renders--;
  let result: Awaited<ReturnType<Renderer>>;
  try {
    result = await options.render(page.url);
  } catch (err) {
    if (err instanceof PageError) throw err;
    throw new PageError("Couldn't load this site in a browser either. Paste the text instead.", 502);
  }
  const extracted = extractPage(result.html, result.url);
  const text = result.text
    ?.split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { ...extracted, ...(text && { text }), rendered: true };
}

/**
 * Fetches a job ad (one page) or a portfolio (the start page plus a few same-site pages,
 * project-like ones first). Linked pages that fail or have no text are skipped.
 */
export async function fetchPages(rawUrl: string, mode: PageMode, options: CrawlOptions): Promise<ExtractedPage[]> {
  const { maxPages, maxRenders } = { ...DEFAULTS, ...options };
  const budget = { renders: maxRenders };
  const start = await loadPage(rawUrl, options, budget);
  // A job site's structured data holds just the ad: no navigation, "similar jobs" or footer.
  if (mode === "job" && start.jobPosting) {
    return [{ ...start, title: start.jobPosting.title || start.title, text: start.jobPosting.text }];
  }
  if (!start.text) {
    throw new PageError(
      start.clientRendered && !start.rendered
        ? "This site is built with JavaScript, so its text can't be read from a link. Paste the text instead."
        : "No readable text was found on that page. Paste the text instead.",
      422,
    );
  }
  if (mode === "job") return [start];

  const isProjectLike = (link: string) => PROJECT_LIKE.test(new URL(link).pathname);
  const ranked = [...start.links.filter(isProjectLike), ...start.links.filter((l) => !isProjectLike(l))];
  const subpages = await Promise.allSettled(ranked.slice(0, maxPages - 1).map((link) => loadPage(link, options, budget)));
  return [
    start,
    ...subpages.flatMap((r) => (r.status === "fulfilled" && r.value.text ? [r.value] : [])),
  ];
}
