# JobFit

Paste a job ad and a CV, or upload the CV as a Word (.docx) or PDF file. JobFit matches every requirement to the CV lines that back it up, by meaning rather than keywords, and flags what's missing.

**Everything runs in the browser.** The embedding model is downloaded once (~34 MB, then cached) and runs on the visitor's device in a Web Worker. No server, no API key, no data leaves the device.

## How it works

0. **Reading the CV file** ([src/cv/](src/cv/)): `.docx` files are read with mammoth and PDFs with pdf.js, both in the browser and loaded only when needed. A PDF holds positioned runs of text, not lines, so [layout.ts](src/cv/layout.ts) rebuilds lines and section breaks from their coordinates.

```
job ad ──► extractRequirements ──┐                       ┌─► met / partial / gap
                                 ├─► embed (bge-small) ──► cosine match ─┤
CV ──────► segment ──────────────┘                       └─► named-term check ─► report
```

1. **Segmentation** ([src/core/segment.ts](src/core/segment.ts)): splits text into bullets and sentences, handles abbreviations, and drops headings and the non-requirement sections of an ad ("About us", "We offer", "How to apply").
2. **Embedding** ([src/embedder/](src/embedder/)): `bge-small-en-v1.5`, quantised, via Transformers.js. Requirements are embedded as search *queries*, CV lines as *passages*.
3. **Matching** ([src/core/match.ts](src/core/match.ts)): each requirement's best CV line decides its status (met ≥ 0.65, partial ≥ 0.5, otherwise a gap).
4. **Named-term check** ([src/core/terms.ts](src/core/terms.ts)): if a requirement names a specific skill (Swedish, Kubernetes, SQL…) that the CV never mentions, its status drops one level.

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
npm run build   # static site in dist/, deployable to GitHub Pages / Vercel / Netlify
```

The core logic was written test-first. Its tests use a deterministic bag-of-words embedder ([src/core/testing.ts](src/core/testing.ts)), so they run in milliseconds and don't depend on a model.

## Limits

- English-focused model. Finnish or Swedish ads will match less reliably.
- The named-term check catches capitalised names and tech tokens (`C++`, `Node.js`), not lowercase skills.
- Similarity is not proof: the report shows its evidence so a human can judge.
- Scanned PDFs (images with no text layer) can't be read. The app says so and suggests exporting from Word or Google Docs instead. Old `.doc` files need saving as `.docx` first.
- Two-column CV layouts may come out with columns interleaved, so the extracted text is shown for checking before analysis.

## Roadmap

- [ ] Evaluation set with precision and recall per status, run in CI
- [ ] Job ad from a link (needs a small serverless fetch function because of CORS)
- [ ] Layer 2: in-browser LLM (WebLLM) for a cover-letter draft built only from the matched evidence
- [ ] Deploy to GitHub Pages
