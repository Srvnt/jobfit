# JobFit

Give JobFit a job ad (pasted or as a link), your CV (pasted, or as a Word or PDF file) and optionally your portfolio site. It matches every requirement to the lines that back it up, by meaning rather than keywords, shows where each piece of evidence came from, and flags what's missing. When the portfolio supports a requirement better than the CV does, it suggests adding that to the CV.

**Live demo:** https://jobfit-cloud.vercel.app/

**The AI runs in the browser.** A multilingual embedding model (English and Finnish) is downloaded once (~118 MB, then cached) and runs on the visitor's device in a Web Worker. No API key, and the CV never leaves the device.

The only server part is a small page fetcher ([api/fetch-page.ts](api/fetch-page.ts)) for reading a job ad or portfolio from a link, because browsers can't read other sites' pages directly (CORS). Only those public addresses pass through it.

## How it works

0. **Reading the CV file** ([src/cv/](src/cv/)): `.docx` files are read with mammoth and PDFs with pdf.js, both in the browser and loaded only when needed. A PDF holds positioned runs of text, not lines, so [layout.ts](src/cv/layout.ts) rebuilds lines and section breaks from their coordinates.

```
job ad ──► extractRequirements ──┐                          ┌─► met / partial / gap
                                 ├─► embed (multilingual) ──► cosine match ─┤
CV ──────► segment ──────────────┘                       └─► named-term check ─► report
```

1. **Segmentation** ([src/core/segment.ts](src/core/segment.ts)): splits text into bullets and sentences and handles abbreviations. For a job ad, when it has requirement headings ("Qualifications", "Required", "Considered an advantage", "Mitä odotamme sinulta?", "Katsomme eduksi"), only those sections are kept. A prose paragraph after a requirement list ends the section. Without such headings, it drops the clearly non-requirement sections ("About us", "We offer", "Mitä tarjoamme?"…). Short lines inside a requirement section count as list items, because job sites' structured data often drops the bullet markers.
   For ads **without** requirement headings (or pasted together with the whole page), an **AI line filter** ([src/core/lineFilter.ts](src/core/lineFilter.ts)) runs the same embedding model as a zero-shot classifier. Each line is compared with example requirements ("Kokemusta Javasta", "Fluent English") and with examples of everything else in an ad ("Tarjoamme joustavat työajat", "Location: Helsinki", "Apply by Friday", "Share this job"). It's kept when it's closer to the requirements. The lines it leaves out are listed under the results, so nothing disappears silently. When an ad has requirement headings, they're trusted and the filter isn't used: on real ads the headings were near-perfect, and the filter removed real requirements there.
2. **Embedding** ([src/embedder/](src/embedder/)): `paraphrase-multilingual-MiniLM-L12-v2`, quantised, via Transformers.js, in a Web Worker. It was chosen over `bge-small-en-v1.5` and `multilingual-e5-small` by the evaluation below. The model settings live in [model.ts](src/embedder/model.ts), shared by the browser and the evaluation.
3. **Matching** ([src/core/match.ts](src/core/match.ts)): each requirement's best CV or portfolio line decides its status (met ≥ 0.43, partial ≥ 0.31, otherwise a gap). Every model scores on its own scale, so the thresholds come from the evaluation too.
4. **Named-term check** ([src/core/terms.ts](src/core/terms.ts)): if a requirement names a specific skill (Swedish, Kubernetes, SQL…) that neither the CV nor the portfolio mentions, its status drops one level. A requirement's first word counts too, unless it's a common opener ("Experience", "Strong"). In Finnish, where every first word is capitalised, it counts only as the head of a hyphenated compound ("Linux-palvelimien"), since Finnish joins names to compounds with a hyphen. Finnish case endings and compounds are understood ("Javalla" = Java, "PostgreSQL-tietokannoista" = PostgreSQL), and so are language requirements ("ruotsin kielen taito" = Swedish, matching "Swedish" or "ruotsi" in the CV). When a requirement offers alternatives ("Python, Java or TypeScript"), one of them is enough.
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

## Evaluation (`npm run eval`)

[eval/cases.ts](eval/cases.ts) holds a labelled set: one fictional candidate with an English CV and portfolio, and 60 requirements in the style of real Finnish job ads (21 of them in Finnish), each labelled with the status a careful recruiter would give. `npm run eval` runs every model through the real matcher, sweeps the thresholds for each (models score on different scales), shows how sensitive the result is to the threshold, and saves the report to [eval/results.txt](eval/results.txt).

**Model comparison**, each model at its own best thresholds:

| Model | Download | Accuracy | English | Finnish | False "met" | Met threshold ±0.04 |
|---|---|---|---|---|---|---|
| bge-small-en-v1.5 | 34 MB | 77% | 87% | 57% | 0 | 63–75% |
| multilingual-e5-small | 118 MB | 75% | 82% | 62% | 0 | 47–73% |
| **paraphrase-multilingual-MiniLM** (used) | 118 MB | **83%** | 85% | **81%** | 0 | 78–80% |

**How the named-term check got here** (with bge-small-en, on the first 44 cases):

| Change | Accuracy | Finnish |
|---|---|---|
| Start: first word skipped, exact spelling only | 65% | 20% |
| Check the first word, Finnish endings, alternatives | 84% | 60% |

The biggest single gain came from checking a requirement's first word: in requirement lists that's often the skill itself ("Kubernetes in production"). Adding Finnish cases then showed that the same rule misfired in Finnish ("**Testivetoinen** kehitys" read as a missing skill), which led to the hyphen-compound rule. The labels are judgement calls and the set is small, so thresholds come from the middle of a flat range rather than being tuned to single cases.

### Requirement extraction

[eval/ads.ts](eval/ads.ts) holds 5 labelled ads written in the style of real ones: English and Finnish, with and without headings, and an aggregator-style ad. The results are in [eval/extraction-results.txt](eval/extraction-results.txt):

| Method | Precision | Recall |
|---|---|---|
| Heading rules only | 69% | 100% |
| AI line filter only | 81% | 100% |
| **Headings, with the AI filter for ads without them** (used) | **100%** | **100%** |

That 100% is optimistic: the same person wrote the filter's examples and the test ads. On three real ads (Jobly, Remion, Deloitte via Duunitori), the heading rules alone gave clean lists, and applying the filter on top of them dropped 3 real requirements, which is why the filter only runs on ads without headings.

## Development

```bash
npm install
npm test        # unit tests (Vitest), using a fake embedder: fast, no model download
npm run eval    # accuracy on the labelled set with the real model (downloads it once)
npm run dev     # http://localhost:5173
npm run build   # static site in dist/ plus api/ functions, deployed on Vercel
```

The core logic was written test-first. Its tests use a deterministic bag-of-words embedder ([src/core/testing.ts](src/core/testing.ts)), so they run in milliseconds and don't depend on a model.

## Limits

- The model handles English and Finnish (85% and 81% on the evaluation set), but its download is ~118 MB the first time.
- A language missing entirely ("Ruotsin kielen taito" with no Swedish in the CV) shows as partial rather than a gap, because language skills look alike to the model and the named-term check lowers the status by only one level.
- The named-term check catches capitalised names and tech tokens (`C++`, `Node.js`), not lowercase skills.
- Similarity is not proof: the report shows its evidence so a human can judge.
- Scanned PDFs (images with no text layer) can't be read. The app says so and suggests exporting from Word or Google Docs instead. Old `.doc` files need saving as `.docx` first.
- Two-column CV layouts may come out with columns interleaved, so the extracted text is shown for checking before analysis.
- Sites that need a login (e.g. LinkedIn) can't be read. Portfolio text can be pasted into its own field instead.
- Rendering JavaScript sites adds a few seconds, more on a cold serverless start while Chromium unpacks.
- Short tech lists ("Docker, Git and AI tools") score high against most infrastructure requirements; the named-term check catches the clear cases.
- Some job sites (e.g. Duunitori) block requests from cloud servers (HTTP 403). The app explains this and asks for the text to be pasted; it doesn't try to get around the block.
- A text-heavy portfolio adds chance matches: with hundreds of statements, some unrelated line will score 0.6+. Blog metadata lines (dates, tag lists) also end up as statements.
- Finnish job ads: "what we offer" sections aren't recognised yet (the heading keywords are English, and question-style headings like "Mitä tarjoamme sinulle?" aren't treated as headings).

## Roadmap

- [x] Labelled evaluation set (`npm run eval`)
- [x] Multilingual embedding model for Finnish job ads and CVs
- [ ] Run the evaluation in CI and fail on a drop in accuracy
- [x] Page fetcher for job ads and portfolios (server side)
- [x] Link inputs for the job ad and portfolio in the UI, with source tags on evidence
- [x] Finnish section headings in job ads, and requirement sections from JobPosting data
- [ ] Filter metadata lines (dates, tag lists) out of portfolio pages
- [ ] Layer 2: in-browser LLM (WebLLM) for a cover-letter draft built only from the matched evidence
- [ ] Deploy to GitHub Pages
