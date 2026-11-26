import { parseHTML } from "linkedom";

/**
 * Turns a fetched web page (a job ad or a portfolio page) into plain text in the same
 * one-item-per-line shape the segmenter expects, plus the same-site links worth following.
 * Uses linkedom so it runs on the server (Vercel function) and in tests without a browser.
 */

export interface ExtractedPage {
  url: string;
  title: string;
  text: string;
  /** Same-site page links, absolute, in document order. */
  links: string[];
  /** True when the page has no text but loads scripts: a JavaScript app the server can't render. */
  clientRendered: boolean;
  /** The job ad from the page's schema.org JobPosting data, which job sites publish for search engines. */
  jobPosting?: { title: string; text: string };
}

/** Page furniture that never holds the content we want. `<header>` is kept on purpose: portfolios put their intro there. */
const REMOVE = "title, script, style, noscript, template, svg, iframe, nav, footer, aside, form, button, dialog";
const CONSENT = /cookie|consent|gdpr/i;
const BLOCK = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL",
  "BLOCKQUOTE", "PRE", "TABLE", "TR", "TD", "TH", "DL", "DT", "DD", "FIGURE", "FIGCAPTION", "ADDRESS",
]);
const FILE_EXTENSION = /\.(pdf|jpe?g|png|gif|svg|webp|avif|zip|docx?|pptx?|xlsx?|mp3|mp4|mov|webm)$/i;

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function blockText(root: Element): string {
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    const line = current.replace(/\s+/g, " ").trim();
    if (line && line !== "-") lines.push(line);
    current = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === TEXT_NODE) {
      current += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === "BR") return flush();
    const block = BLOCK.has(el.tagName);
    if (block) flush();
    if (el.tagName === "LI") current = "- ";
    el.childNodes.forEach(walk);
    if (block) flush();
  };

  walk(root);
  flush();
  return lines.join("\n");
}

const isJobPosting = (node: unknown): node is { title?: unknown; description?: unknown } => {
  const type = (node as { "@type"?: unknown })?.["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
};

/** Finds a JobPosting in any JSON-LD block, including inside arrays and @graph. */
function findJobPosting(document: Document): ExtractedPage["jobPosting"] {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) queue.push(...node);
      else if (isJobPosting(node) && typeof node.description === "string") {
        let description = node.description;
        // Some sites entity-escape the HTML inside the JSON ("&lt;p&gt;").
        if (!/<[a-z]/i.test(description) && /&lt;/i.test(description)) {
          description = parseHTML(`<html><body>${description}</body></html>`).document.body.textContent ?? "";
        }
        // Plain-text descriptions (no tags) carry their structure in line breaks, which HTML parsing would lose.
        const text = /<[a-z][^>]*>/i.test(description)
          ? blockText(parseHTML(`<html><body>${description}</body></html>`).document.body)
          : description
              .split(/\r?\n/)
              .map((line) => line.replace(/\s+/g, " ").trim())
              .filter(Boolean)
              .join("\n");
        if (text) return { title: typeof node.title === "string" ? node.title.trim() : "", text };
      } else if (node && typeof node === "object" && "@graph" in node) {
        queue.push((node as { "@graph": unknown })["@graph"]);
      }
    }
  }
  return undefined;
}

function sameSiteLinks(document: Document, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  base.hash = "";
  const seen = new Set<string>([base.href]);
  const links: string[] = [];
  for (const a of document.querySelectorAll("a[href]")) {
    let url: URL;
    try {
      url = new URL(a.getAttribute("href")!, base);
    } catch {
      continue;
    }
    url.hash = "";
    if (!/^https?:$/.test(url.protocol) || url.origin !== base.origin || FILE_EXTENSION.test(url.pathname)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    links.push(url.href);
  }
  return links;
}

export function extractPage(html: string, url: string): ExtractedPage {
  // Browsers add a missing <body> themselves; linkedom doesn't, so wrap bare fragments.
  const { document } = parseHTML(/<body[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`);
  const links = sameSiteLinks(document, url);
  const jobPosting = findJobPosting(document);
  const hasScripts = document.querySelector("script[src], script") !== null;
  const title =
    document.querySelector("title")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "";

  document.querySelectorAll(REMOVE).forEach((el) => el.remove());
  document.querySelectorAll("[id], [class]").forEach((el) => {
    if (CONSENT.test(`${el.id} ${el.getAttribute("class") ?? ""}`)) el.remove();
  });

  const main = document.querySelector("main, [role=main]");
  const mainText = main ? blockText(main) : "";
  const text = mainText || (document.body ? blockText(document.body) : "");

  return { url, title, text, links, clientRendered: text === "" && hasScripts, ...(jobPosting && { jobPosting }) };
}
