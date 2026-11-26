import { describe, expect, it } from "vitest";
import { fetchHtml, fetchPages, type FetchLike } from "./fetchPage";

const page = (body: string, title = "Page") =>
  new Response(`<html><head><title>${title}</title></head><body>${body}</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

/** A fake website: maps absolute URLs to responses; anything else is a 404. Records requested URLs. */
function site(routes: Record<string, () => Response>): FetchLike & { requested: string[] } {
  const requested: string[] = [];
  const fake = async (url: string) => {
    requested.push(url);
    return routes[url]?.() ?? new Response("Not found", { status: 404, headers: { "content-type": "text/html" } });
  };
  return Object.assign(fake, { requested });
}

const redirect = (location: string, status = 301) => () => new Response(null, { status, headers: { location } });

describe("fetchHtml", () => {
  it("returns the HTML and the final URL", async () => {
    const fetch = site({ "https://jobs.example/ad/1": () => page("<p>Hello</p>") });
    const result = await fetchHtml("https://jobs.example/ad/1", { fetch });
    expect(result.url).toBe("https://jobs.example/ad/1");
    expect(result.html).toContain("<p>Hello</p>");
  });

  it("follows redirects, resolving relative locations", async () => {
    const fetch = site({
      "https://jobs.example/old": redirect("/new", 302),
      "https://jobs.example/new": () => page("<p>Moved</p>"),
    });
    expect((await fetchHtml("https://jobs.example/old", { fetch })).url).toBe("https://jobs.example/new");
  });

  it("refuses a redirect to a private address", async () => {
    const fetch = site({ "https://jobs.example/ad": redirect("http://169.254.169.254/latest/meta-data/") });
    await expect(fetchHtml("https://jobs.example/ad", { fetch })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/public/i) });
  });

  it("gives up after too many redirects", async () => {
    const fetch = site({ "https://a.example/1": redirect("/2"), "https://a.example/2": redirect("/1") });
    await expect(fetchHtml("https://a.example/1", { fetch, maxRedirects: 3 })).rejects.toThrow(/redirect/i);
  });

  it("rejects unsafe input URLs with status 400, without fetching", async () => {
    const fetch = site({});
    await expect(fetchHtml("http://localhost/admin", { fetch })).rejects.toMatchObject({ status: 400 });
    expect(fetch.requested).toEqual([]);
  });

  it("reports HTTP errors with the status code", async () => {
    const fetch = site({});
    await expect(fetchHtml("https://jobs.example/gone", { fetch })).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/404/) });
  });

  it.each([401, 403, 429])("explains that a site answering %i blocks automated access", async (status) => {
    const fetch = site({ "https://jobs.example/ad": () => new Response("no", { status, headers: { "content-type": "text/html" } }) });
    await expect(fetchHtml("https://jobs.example/ad", { fetch })).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/blocks automated access.*paste/i),
    });
  });

  it("rejects responses that are not web pages", async () => {
    const fetch = site({
      "https://jobs.example/cv.pdf": () => new Response("%PDF-1.7", { headers: { "content-type": "application/pdf" } }),
    });
    await expect(fetchHtml("https://jobs.example/cv.pdf", { fetch })).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/not a web page/i),
    });
  });

  it("stops reading a page that is larger than the limit", async () => {
    const fetch = site({ "https://jobs.example/huge": () => page("x".repeat(5000)) });
    await expect(fetchHtml("https://jobs.example/huge", { fetch, maxBytes: 1000 })).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/too large/i),
    });
  });

  it("times out on a slow site", async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    await expect(fetchHtml("https://slow.example/", { fetch: slow, timeoutMs: 20 })).rejects.toMatchObject({
      status: 504,
      message: expect.stringMatching(/too long/i),
    });
  });

  it("decodes the charset given in the content type", async () => {
    const latin1 = new Uint8Array([...new TextEncoder().encode("<p>Ty"), 0xf6, ...new TextEncoder().encode("</p>")]);
    const fetch = site({
      "https://old.example/": () => new Response(latin1, { headers: { "content-type": "text/html; charset=iso-8859-1" } }),
    });
    expect((await fetchHtml("https://old.example/", { fetch })).html).toBe("<p>Työ</p>");
  });
});

describe("fetchPages", () => {
  const home = `
    <p>Data engineer building retail data platforms.</p>
    <a href="/about">About</a><a href="/blog/post">Blog</a><a href="/projects/a">Project A</a>
    <a href="/work/b">Work B</a><a href="/contact">Contact</a>`;

  it("fetches only the given page for a job ad", async () => {
    const fetch = site({ "https://jobs.example/ad": () => page(`<p>Python developer wanted now.</p>${home}`, "Ad") });
    const pages = await fetchPages("https://jobs.example/ad", "job", { fetch });
    expect(pages.map((p) => p.url)).toEqual(["https://jobs.example/ad"]);
    expect(fetch.requested).toEqual(["https://jobs.example/ad"]);
  });

  it("uses the JobPosting data for a job ad when the page has it", async () => {
    const data = { "@type": "JobPosting", title: "Data Engineer", description: "<ul><li>Daily Python experience</li></ul>" };
    const fetch = site({
      "https://jobs.example/ad": () =>
        page(`<p>Cookie settings and similar jobs</p><script type="application/ld+json">${JSON.stringify(data)}</script>`, "Ad page"),
    });
    const [ad] = await fetchPages("https://jobs.example/ad", "job", { fetch });
    expect(ad).toMatchObject({ url: "https://jobs.example/ad", title: "Data Engineer", text: "- Daily Python experience" });
  });

  it("for a portfolio, follows same-site links up to the page limit, project-like pages first", async () => {
    const fetch = site({
      "https://alex.example/": () => page(home, "Alex"),
      "https://alex.example/projects/a": () => page("<p>Built a forecasting API in Python.</p>"),
      "https://alex.example/work/b": () => page("<p>Migrated services to Kubernetes.</p>"),
      "https://alex.example/about": () => page("<p>I live in Helsinki with my cat.</p>"),
    });
    const pages = await fetchPages("https://alex.example/", "portfolio", { fetch, maxPages: 3 });
    expect(pages.map((p) => p.url)).toEqual([
      "https://alex.example/",
      "https://alex.example/projects/a",
      "https://alex.example/work/b",
    ]);
  });

  it("skips subpages that fail or have no text", async () => {
    const fetch = site({
      "https://alex.example/": () => page(home),
      "https://alex.example/projects/a": () => new Response("boom", { status: 500, headers: { "content-type": "text/html" } }),
      "https://alex.example/work/b": () => page("<div id='root'></div><script src='/app.js'></script>"),
      "https://alex.example/about": () => page("<p>I live in Helsinki with my cat.</p>"),
    });
    const pages = await fetchPages("https://alex.example/", "portfolio", { fetch, maxPages: 5 });
    expect(pages.map((p) => p.url)).toEqual(["https://alex.example/", "https://alex.example/about"]);
  });

  it("explains when the start page is a JavaScript app with no server-rendered text", async () => {
    const fetch = site({ "https://spa.example/": () => page("<div id='root'></div><script src='/app.js'></script>") });
    await expect(fetchPages("https://spa.example/", "portfolio", { fetch })).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/JavaScript/),
    });
  });
});
