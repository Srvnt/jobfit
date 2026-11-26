import { fetchPages, PageError, type CrawlOptions, type FetchLike, type PageMode, type Renderer } from "./fetchPage.js";

/**
 * POST /api/fetch-page  { url, mode: "job" | "portfolio" }
 * → 200 { pages: [{ url, title, text }] }   or   4xx/5xx { error }
 *
 * Only public page addresses pass through here; the CV itself never does.
 */

export interface HandlerDeps {
  fetch: FetchLike;
  /** Headless browser for JavaScript-only sites; without it those sites get a "paste the text" message. */
  render?: Renderer;
  /** Overridable for tests. */
  crawl?: (url: string, mode: PageMode, options: CrawlOptions) => ReturnType<typeof fetchPages>;
}

const MAX_URL_LENGTH = 2048;
const MODES: PageMode[] = ["job", "portfolio"];

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

export async function handleFetchPage(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Use POST." }, { allow: "POST" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "The request body must be JSON." });
  }
  const { url, mode } = (body ?? {}) as { url?: unknown; mode?: unknown };
  if (typeof url !== "string" || !url.trim()) return json(400, { error: "Give the address of a page." });
  if (url.length > MAX_URL_LENGTH) return json(400, { error: "That address is too long." });
  if (!MODES.includes(mode as PageMode)) return json(400, { error: 'mode must be "job" or "portfolio".' });

  try {
    const pages = await (deps.crawl ?? fetchPages)(url, mode as PageMode, { fetch: deps.fetch, render: deps.render });
    return json(200, { pages: pages.map(({ url, title, text }) => ({ url, title, text })) });
  } catch (err) {
    if (err instanceof PageError) return json(err.status, { error: err.message });
    console.error("fetch-page failed", err);
    return json(500, { error: "Something went wrong while reading the page." });
  }
}
