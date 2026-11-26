// Vercel serverless function: POST /api/fetch-page { url, mode: "job" | "portfolio" }.
// Relative imports carry .js extensions because Vercel runs this as an ES module.
import { handleFetchPage } from "../src/web/handler.js";
import { safeFetch } from "../src/web/nodeFetch.js";
import { renderInBrowser } from "../src/web/nodeRender.js";

const handle = (request: Request) => handleFetchPage(request, { fetch: safeFetch, render: renderInBrowser });

export const POST = handle;
export const GET = handle; // answers 405 with an Allow header
