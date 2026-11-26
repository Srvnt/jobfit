import { existsSync } from "node:fs";
import { lookup } from "node:dns/promises";
import puppeteer, { type Browser } from "puppeteer-core";
import { PageError, type Renderer } from "./fetchPage.js";
import { createRequestGuard } from "./requestGuard.js";

/**
 * Renders JavaScript-only pages in headless Chromium: @sparticuz/chromium on Vercel, the local
 * Chrome in development. Every request the page makes goes through the SSRF request guard.
 */

const LOCAL_CHROME = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const NAVIGATION_TIMEOUT_MS = 15_000;
const CONTENT_WAIT_MS = 5_000;
const MAX_HTML_CHARS = 2 * 1024 * 1024;
/** Same page furniture the HTML extractor drops (see page.ts). */
const FURNITURE = "script, style, noscript, template, svg, iframe, nav, footer, aside, form, button, dialog";

async function launch(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  const executablePath = process.env.CHROME_PATH ?? LOCAL_CHROME.find((path) => existsSync(path));
  if (!executablePath) {
    throw new PageError("JavaScript sites need Chrome on this machine. Set CHROME_PATH, or paste the text instead.", 501);
  }
  return puppeteer.launch({ executablePath, headless: true });
}

// One browser per warm server instance; each render gets its own isolated context.
let browser: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  browser ??= launch().then((b) => {
    b.on("disconnected", () => (browser = null));
    return b;
  });
  browser.catch(() => (browser = null));
  return browser;
}

export const renderInBrowser: Renderer = async (url) => {
  const guard = createRequestGuard((hostname) => lookup(hostname, { all: true }));
  const context = await (await getBrowser()).createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.isInterceptResolutionHandled()) return;
      guard(request.url(), request.resourceType()).then(
        (allowed) => (allowed ? request.continue() : request.abort("blockedbyclient")),
        () => request.abort("failed"),
      );
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT_MS });
    // Some apps fetch their content after load; give them a moment to put text on the page.
    await page
      .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 80, { timeout: CONTENT_WAIT_MS })
      .catch(() => undefined);
    const html = (await page.content()).slice(0, MAX_HTML_CHARS);
    // The browser's innerText follows the CSS layout, so "<span>Petri</span><span>Malmström</span>"
    // reads as two words. Drop page furniture first, as the HTML extractor does.
    const text = await page.evaluate((selector) => {
      document.querySelectorAll(selector).forEach((el) => el.remove());
      document.querySelectorAll("[id], [class]").forEach((el) => {
        if (/cookie|consent|gdpr/i.test(`${el.id} ${el.getAttribute("class") ?? ""}`)) el.remove();
      });
      const root = document.querySelector("main, [role=main]") ?? document.body;
      return (root as HTMLElement | null)?.innerText ?? "";
    }, FURNITURE);
    return { url: page.url(), html, text };
  } finally {
    await context.close().catch(() => undefined);
  }
};
