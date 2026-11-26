import { describe, expect, it } from "vitest";
import { extractPage } from "./page";

const URL_ = "https://alex.example/";

const html = (body: string, head = "<title>Alex Example – Portfolio</title>") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe("extractPage: title", () => {
  it("uses the <title>, trimmed", () => {
    expect(extractPage(html("<p>Hello there world</p>", "<title>\n  My site  </title>"), URL_).title).toBe("My site");
  });

  it("falls back to the first h1 when there is no title", () => {
    expect(extractPage(html("<h1>Alex Example</h1>", ""), URL_).title).toBe("Alex Example");
  });
});

describe("extractPage: text", () => {
  it("puts headings, paragraphs and list items on their own lines, with list items as bullets", () => {
    const page = extractPage(
      html(`
        <h2>Projects</h2>
        <p>I build <strong>data tools</strong> for <a href="/x">retailers</a>.</p>
        <ul><li>Built a forecasting API</li><li>Led a migration to dbt</li></ul>
        <p>First line<br>Second line</p>`),
      URL_,
    );
    expect(page.text).toBe(
      "Projects\nI build data tools for retailers.\n- Built a forecasting API\n- Led a migration to dbt\nFirst line\nSecond line",
    );
  });

  it("drops navigation, scripts, styles, forms and other page furniture", () => {
    const page = extractPage(
      html(`
        <header><nav><a href="/">Home</a><a href="/about">About me</a></nav></header>
        <script>var tracking = 1;</script><style>p { color: red }</style>
        <aside>Latest tweets from somebody</aside>
        <p>Built ETL pipelines with Airflow.</p>
        <form><label>Your email address here</label></form>
        <noscript>Please enable JavaScript</noscript>
        <footer>© 2026 Alex Example</footer>`),
      URL_,
    );
    expect(page.text).toBe("Built ETL pipelines with Airflow.");
  });

  it("drops cookie and consent banners recognised by id or class", () => {
    const page = extractPage(
      html(`<div class="cookie-banner">We use cookies to improve things</div>
            <div id="gdpr-consent">Accept all tracking cookies</div>
            <p>Trained a demand forecasting model.</p>`),
      URL_,
    );
    expect(page.text).toBe("Trained a demand forecasting model.");
  });

  it("prefers the <main> element when the page has one", () => {
    const page = extractPage(
      html(`<div class="sidebar">Some unrelated sidebar text</div>
            <main><p>Shipped a React dashboard for sales teams.</p></main>`),
      URL_,
    );
    expect(page.text).toBe("Shipped a React dashboard for sales teams.");
  });

  it("reads pages that leave out the optional <html>, <head> and <body> tags", () => {
    const page = extractPage("<title>Data engineer</title><p>We need Python and SQL skills.</p>", URL_);
    expect(page.title).toBe("Data engineer");
    expect(page.text).toBe("We need Python and SQL skills.");
  });

  it("collapses whitespace and decodes entities", () => {
    const page = extractPage(html("<p>  SQL   &amp;\n  Python &ndash; daily  </p>"), URL_);
    expect(page.text).toBe("SQL & Python – daily");
  });
});

describe("extractPage: client-rendered pages", () => {
  it("flags a page whose body is only a script-mounted app shell", () => {
    const page = extractPage(html('<div id="root"></div><script src="/assets/index.js"></script>'), URL_);
    expect(page.text).toBe("");
    expect(page.clientRendered).toBe(true);
  });

  it("does not flag a normal page", () => {
    expect(extractPage(html("<p>Built ETL pipelines with Airflow.</p>"), URL_).clientRendered).toBe(false);
  });
});

describe("extractPage: links", () => {
  it("lists same-site page links as absolute URLs, in order, without duplicates or fragments", () => {
    const page = extractPage(
      html(`
        <nav><a href="/projects/jobfit">JobFit</a><a href="projects/etl#intro">ETL</a></nav>
        <a href="https://alex.example/projects/jobfit">JobFit again</a>
        <a href="https://github.com/alex">GitHub</a>
        <a href="mailto:alex@alex.example">Email</a>
        <a href="/cv.pdf">CV</a><a href="/photo.JPG">Photo</a>
        <a href="#top">Top</a><a href="/">Home</a>`),
      "https://alex.example/",
    );
    expect(page.links).toEqual(["https://alex.example/projects/jobfit", "https://alex.example/projects/etl"]);
  });
});
