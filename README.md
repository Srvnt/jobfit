# JobFit

Give JobFit a job ad (pasted or as a link), your CV (pasted, or as a Word or PDF file) and optionally your portfolio site. It matches every requirement to the lines that back it up, by meaning rather than keywords, shows where each piece of evidence came from, and flags what's missing. When the portfolio supports a requirement better than the CV does, it suggests adding that to the CV.

**Live demo:** https://jobfit-cloud.vercel.app/

**The AI runs in the browser.** The embedding model is downloaded once (~34 MB, then cached) and runs on the visitor's device in a Web Worker. No API key, and the CV never leaves the device.

The only server part is a small page fetcher ([api/fetch-page.ts](api/fetch-page.ts)) for reading a job ad or portfolio from a link, because browsers can't read other sites' pages directly (CORS). Only those public addresses pass through it.

## How it works

0. **Reading the CV file** ([src/cv/](src/cv/)): `.docx` files are read with mammoth and PDFs with pdf.js, both in the browser and loaded only when needed. A PDF holds positioned runs of text, not lines, so [layout.ts](src/cv/layout.ts) rebuilds lines and section breaks from their coordinates.

```
job ad ──► extractRequirements ──┐                       ┌─► met / partial / gap
                                 ├─► embed (bge-small) ──► cosine match ─┤
CV ──────► segment ──────────────┘                       └─► named-term check ─► report
```

1. **Segmentation** ([src/core/segment.ts](src/core/segment.ts)): splits text into bullets and sentences and handles abbreviations. For a job ad, when it has requirement headings ("Qualifications", "Required", "Considered an advantage", "Mitä odotamme sinulta?", "Katsomme eduksi"), only those sections are kept. A prose paragraph after a requirement list ends the section. Without such headings, it drops the clearly non-requirement sections ("About us", "We offer", "Mitä tarjoamme?"…). Short lines inside a requirement section count as list items, because job sites' structured data often drops the bullet markers.
2. **Embedding** ([src/embedder/](src/embedder/)): `bge-small-en-v1.5`, quantised, via Transformers.js. Requirements are embedded as search *queries*, CV lines as *passages*.
3. **Matching** ([src/core/match.ts](src/core/match.ts)): each requirement's best CV line decides its status (met ≥ 0.65, partial ≥ 0.5, otherwise a gap).
4. **Named-term check** ([src/core/terms.ts](src/core/terms.ts)): if a requirement names a specific skill (Swedish, Kubernetes, SQL…) that neither the CV nor the portfolio mentions, its status drops one level.
5. **Portfolio limits** ([src/core/analyze.ts](src/core/analyze.ts)): at most 50 statements per portfolio page and 150 in total, and embeddings run in batches of 32 ([src/core/batch.ts](src/core/batch.ts)). A blog-sized site once produced 710 statements in one batch and never finished in the browser; with the limits it takes a few seconds.

## Page fetcher (`POST /api/fetch-page`)

```json
{ "url": "https://alex.example/", "mode": "portfolio" }   →   { "pages": [{ "url", "title", "text" }] }
```

`job` mode reads one page. When the page has schema.org `JobPosting` data, which job sites publish for search engines, it uses that description, which is just the ad without navigation, "similar jobs" or footers. `portfolio` mode reads the start page plus up to four same-site pages, project-like paths first. Pages are reduced to text by [src/web/page.ts](src/web/page.ts), which drops navigation, footers, scripts and cookie banners.

A server that fetches user-supplied URLs is a classic SSRF risk, so [src/web/safeUrl.ts](src/web/safeUrl.ts) and [src/web/fetchPage.ts](src/web/fetchPage.ts):

- only allow http(s) on default ports, with no credentials in the URL
- refuse localhost, single-label and `.local`/`.internal` names, and private, loopback, link-local (cloud metadata), CGNAT and other reserved IP ranges, including IPv4-mapped IPv6
- check the DNS answer **at connect time** (an undici dispatcher with a guarded `lookup`), which also covers redirects and DNS rebinding. For example, `localtest.me` resolves to 127.0.0.1 and is refused.
- follow at most 3 redirects, re-checking each one, with an 8 s timeout, a 2 MB size limit and HTML-only content types
- return user-facing messages only, never internal error details

**JavaScript-only sites** (a React or Vue portfolio without pre-rendering, say) have no text in their HTML. When the fetcher detects one, it renders the page in headless Chromium ([src/web/nodeRender.ts](src/web/nodeRender.ts)): `@sparticuz/chromium` on Vercel, the local Chrome in development (or `CHROME_PATH`). It's the slow path, so it's used only when needed and for at most 3 pages per request.

- Every request the page's own scripts make goes through a request guard ([src/web/requestGuard.ts](src/web/requestGuard.ts)) with the same SSRF rules, including a DNS check per host. Images, fonts and media are skipped.
- Each render runs in its own browser context, so no cookies or storage carry over between sites.
- The text comes from the browser's `innerText`, which follows the CSS layout ("<span>Petri</span><span>Malmström</span>" reads as two words). Stylesheets are allowed for that reason.

During `npm run dev`, a small Vite middleware serves the same function, so no Vercel login is needed locally.

## Why the named-term check exists

The first version used embeddings alone, and it rated *"Fluent Swedish is a plus"* as **met** by *"English (fluent)"* (similarity 0.62). Comparing two models on labelled pairs showed this isn't fixable by picking a better model or threshold:

| Pair | MiniLM-L6 | bge-small |
|---|---|---|
| ✓ data pipelines ↔ ETL pipelines with Airflow | 0.53 | 0.72 |
| ✓ ML in production ↔ deployed a forecasting model | 0.34 | 0.71 |
| ✗ Fluent Swedish ↔ English (fluent) | **0.62** | **0.66** |
| ✗ Kubernetes ↔ Docker, Terraform | 0.29 | 0.53 |

bge-small separates real matches much better, so it became the model. The language-name confusion remains in both, so a literal check on named terms now handles that case. Embeddings are good at paraphrase and bad at proper nouns, so each technique covers the other's weakness.

## Development

```bash
npm install
npm test        # unit tests (Vitest), using a fake embedder: fast, no model download
npm run dev     # http://localhost:5173
npm run build   # static site in dist/ plus api/ functions, deployed on Vercel
```

The core logic was written test-first. Its tests use a deterministic bag-of-words embedder ([src/core/testing.ts](src/core/testing.ts)), so they run in milliseconds and don't depend on a model.

## Limits

- English-focused model. Finnish or Swedish ads will match less reliably.
- The named-term check catches capitalised names and tech tokens (`C++`, `Node.js`), not lowercase skills.
- Similarity is not proof: the report shows its evidence so a human can judge.
- Scanned PDFs (images with no text layer) can't be read. The app says so and suggests exporting from Word or Google Docs instead. Old `.doc` files need saving as `.docx` first.
- Two-column CV layouts may come out with columns interleaved, so the extracted text is shown for checking before analysis.
- Sites that need a login (e.g. LinkedIn) can't be read. Portfolio text can be pasted into its own field instead.
- Rendering JavaScript sites adds a few seconds, more on a cold serverless start while Chromium unpacks.
- The named-term check skips a line's first word, so a requirement like "Ansible or other infrastructure automation" isn't checked for "Ansible". Short tech lists ("Docker, Git and AI tools") also score high against most infrastructure requirements.
- Some job sites (e.g. Duunitori) block requests from cloud servers (HTTP 403). The app explains this and asks for the text to be pasted; it doesn't try to get around the block.
- A text-heavy portfolio adds chance matches: with hundreds of statements, some unrelated line will score 0.6+. Blog metadata lines (dates, tag lists) also end up as statements.
- Finnish job ads: "what we offer" sections aren't recognised yet (the heading keywords are English, and question-style headings like "Mitä tarjoamme sinulle?" aren't treated as headings).

## Roadmap

- [ ] Evaluation set with precision and recall per status, run in CI
- [x] Page fetcher for job ads and portfolios (server side)
- [x] Link inputs for the job ad and portfolio in the UI, with source tags on evidence
- [x] Finnish section headings in job ads, and requirement sections from JobPosting data
- [ ] Filter metadata lines (dates, tag lists) out of portfolio pages
- [ ] Layer 2: in-browser LLM (WebLLM) for a cover-letter draft built only from the matched evidence
- [ ] Deploy to GitHub Pages
