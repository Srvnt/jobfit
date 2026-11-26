import { describe, expect, it } from "vitest";
import type { FetchLike } from "./fetchPage";
import { handleFetchPage } from "./handler";

const fetch: FetchLike = async (url) =>
  url === "https://jobs.example/ad"
    ? new Response("<title>Data engineer</title><p>We need Python and SQL skills.</p>", {
        headers: { "content-type": "text/html" },
      })
    : new Response("nope", { status: 404, headers: { "content-type": "text/html" } });

const post = (body: unknown) =>
  new Request("http://localhost/api/fetch-page", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("handleFetchPage", () => {
  it("returns the extracted pages as JSON", async () => {
    const response = await handleFetchPage(post({ url: "https://jobs.example/ad", mode: "job" }), { fetch });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      pages: [{ url: "https://jobs.example/ad", title: "Data engineer", text: "We need Python and SQL skills." }],
    });
  });

  it("only accepts POST", async () => {
    const response = await handleFetchPage(new Request("http://localhost/api/fetch-page"), { fetch });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it.each([
    ["not json", "{oops"],
    ["a missing url", { mode: "job" }],
    ["an unknown mode", { url: "https://jobs.example/ad", mode: "everything" }],
    ["an overly long url", { url: `https://jobs.example/${"a".repeat(3000)}`, mode: "job" }],
  ])("answers 400 for %s", async (_, body) => {
    const response = await handleFetchPage(post(body), { fetch });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
  });

  it("passes on the fetcher's status and message", async () => {
    const unsafe = await handleFetchPage(post({ url: "http://127.0.0.1/", mode: "job" }), { fetch });
    expect(unsafe.status).toBe(400);
    expect((await unsafe.json()).error).toMatch(/public/i);

    const missing = await handleFetchPage(post({ url: "https://jobs.example/nope", mode: "job" }), { fetch });
    expect(missing.status).toBe(502);
    expect((await missing.json()).error).toMatch(/404/);
  });

  it("hides unexpected internal errors behind a generic 500", async () => {
    const response = await handleFetchPage(post({ url: "https://jobs.example/ad", mode: "job" }), {
      fetch,
      crawl: async () => {
        throw new Error("secret internal detail");
      },
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
