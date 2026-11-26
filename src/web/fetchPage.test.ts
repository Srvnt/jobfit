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

describe("fetchPages with a browser renderer for JavaScript sites", () => {
  const shell = () => page("<div id='root'></div><script type='module' src='/assets/app.js'></script>", "Alex");

  /** A fake headless browser: returns the "rendered" HTML for known URLs and records calls. */
  function renderer(pages: Record<string, string>) {
    const rendered: string[] = [];
    const render = async (url: string) => {
      rendered.push(url);
      const body = pages[url];
      if (body === undefined) throw new Error("navigation failed");
      return { url, html: `<html><head><title>Rendered</title></head><body>${body}</body></html>` };
    };
    return Object.assign(render, { rendered });
  }

  it("renders a JavaScript start page in the browser and uses its text", async () => {
    const fetch = site({ "https://alex.example/": shell });
    const render = renderer({ "https://alex.example/": "<main><p>Full-stack developer with Java and React.</p></main>" });
    const pages = await fetchPages("https://alex.example/", "portfolio", { fetch, render });
    expect(pages.map((p) => p.text)).toEqual(["Full-stack developer with Java and React."]);
    expect(render.rendered).toEqual(["https://alex.example/"]);
  });

  it("prefers the browser's own layout-aware text when the renderer provides it", async () => {
    const fetch = site({ "https://alex.example/": shell });
    const render = async (url: string) => ({
      url,
      html: "<main><span>Petri</span><span>Malmström</span><p>Full-stack developer with Java and React.</p></main>",
      text: "Petri Malmström\n\n  Full-stack developer   with Java and React.\n",
    });
    const [home] = await fetchPages("https://alex.example/", "portfolio", { fetch, render });
    expect(home.text).toBe("Petri Malmström\nFull-stack developer with Java and React.");
  });

  it("doesn't start the browser for ordinary pages", async () => {
    const fetch = site({ "https://alex.example/": () => page("<p>Built ETL pipelines with Airflow.</p>") });
    const render = renderer({});
    await fetchPages("https://alex.example/", "portfolio", { fetch, render });
    expect(render.rendered).toEqual([]);
  });

  it("reads JobPosting data from a rendered job page", async () => {
    const data = { "@type": "JobPosting", title: "Java Developer", description: "<ul><li>Java 17 and Spring Boot</li></ul>" };
    const fetch = site({ "https://jobs.example/ad": shell });
    const render = renderer({
      "https://jobs.example/ad": `<p>Apply now!</p><script type="application/ld+json">${JSON.stringify(data)}</script>`,
    });
    const [ad] = await fetchPages("https://jobs.example/ad", "job", { fetch, render });
    expect(ad).toMatchObject({ title: "Java Developer", text: "- Java 17 and Spring Boot" });
  });

  it("renders JavaScript subpages too, but no more than the render limit", async () => {
    const links = '<a href="/projects/a">A</a><a href="/projects/b">B</a><a href="/projects/c">C</a>';
    const fetch = site({
      "https://alex.example/": shell,
      "https://alex.example/projects/a": shell,
      "https://alex.example/projects/b": shell,
      "https://alex.example/projects/c": shell,
    });
    const render = renderer({
      "https://alex.example/": `<p>Full-stack developer with Java and React.</p>${links}`,
      "https://alex.example/projects/a": "<p>Built an order service in Spring Boot.</p>",
      "https://alex.example/projects/b": "<p>Automated deployments with GitHub Actions.</p>",
      "https://alex.example/projects/c": "<p>Migrated a database to PostgreSQL 16.</p>",
    });
    const pages = await fetchPages("https://alex.example/", "portfolio", { fetch, render, maxRenders: 3 });
    expect(render.rendered).toHaveLength(3);
    expect(pages.map((p) => p.url)).toEqual([
      "https://alex.example/",
      "https://alex.example/projects/a",
      "https://alex.example/projects/b",
    ]);
  });

  it("explains when even the rendered page has no text", async () => {
    const fetch = site({ "https://alex.example/": shell });
    const render = renderer({ "https://alex.example/": "<canvas></canvas>" });
    await expect(fetchPages("https://alex.example/", "portfolio", { fetch, render })).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/no readable text.*paste/i),
    });
  });

  it("explains when the browser can't load the site", async () => {
    const fetch = site({ "https://alex.example/": shell });
    const render = renderer({});
    await expect(fetchPages("https://alex.example/", "portfolio", { fetch, render })).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/couldn't load.*browser.*paste/i),
    });
  });
});
