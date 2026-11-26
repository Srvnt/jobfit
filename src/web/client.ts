import type { PortfolioPage } from "../core/analyze";
import type { PageMode } from "./fetchPage";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Asks the server-side page fetcher for a job ad or portfolio. Throws Errors with user-facing messages. */
export async function fetchPagesFromApi(
  url: string,
  mode: PageMode,
  fetchFn: FetchFn = (...args) => fetch(...args),
): Promise<PortfolioPage[]> {
  const address = url.trim();
  if (!address) throw new Error("Enter a web address first.");

  let response: Response;
  try {
    response = await fetchFn("/api/fetch-page", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: address, mode }),
    });
  } catch {
    throw new Error("Couldn't reach the page fetcher. Check your connection and try again.");
  }

  let body: { pages?: PortfolioPage[]; error?: string };
  try {
    body = await response.json();
  } catch {
    throw new Error("The page fetcher isn't available here. Copy and paste the text instead.");
  }
  if (!response.ok || !body.pages) throw new Error(body.error ?? "Couldn't read that page.");
  return body.pages;
}
