import { lookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import type { FetchLike } from "./fetchPage.js";
import { createSafeLookup } from "./safeUrl.js";

/**
 * The real HTTP client for the server. Every connection's DNS answer goes through
 * createSafeLookup, so a host can never be steered to a private address, not even
 * on a redirect or by answering DNS differently the second time (DNS rebinding).
 */
const agent = new Agent({
  connect: {
    lookup: createSafeLookup((hostname) => lookup(hostname, { all: true })) as never,
    timeout: 5000,
  },
});

export const safeFetch: FetchLike = (url, init) =>
  undiciFetch(url, { ...init, dispatcher: agent }) as unknown as Promise<Response>;
