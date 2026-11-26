import { describe, expect, it } from "vitest";
import { fetchPagesFromApi } from "./client";

type Call = { url: string; init?: RequestInit };

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return respond();
  };
  return Object.assign(fetch, { calls });
}

const page = { url: "https://alex.example/", title: "Alex", text: "Built ETL pipelines in Python." };

describe("fetchPagesFromApi", () => {
  it("POSTs the trimmed URL and mode as JSON and returns the pages", async () => {
    const fetch = fakeFetch(() => Response.json({ pages: [page] }));
    expect(await fetchPagesFromApi("  alex.example  ", "portfolio", fetch)).toEqual([page]);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0].url).toBe("/api/fetch-page");
    expect(fetch.calls[0].init?.method).toBe("POST");
    expect(JSON.parse(fetch.calls[0].init?.body as string)).toEqual({ url: "alex.example", mode: "portfolio" });
  });

  it("throws the server's error message", async () => {
    const fetch = fakeFetch(() => Response.json({ error: "Only public websites can be fetched." }, { status: 400 }));
    await expect(fetchPagesFromApi("http://localhost", "job", fetch)).rejects.toThrow("Only public websites can be fetched.");
  });

  it("explains when the page fetcher isn't available (a non-JSON answer)", async () => {
    const fetch = fakeFetch(() => new Response("<html>Not found</html>", { status: 404 }));
    await expect(fetchPagesFromApi("https://alex.example", "job", fetch)).rejects.toThrow(/fetcher isn't available.*paste/i);
  });

  it("explains a network failure", async () => {
    const fetch = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(fetchPagesFromApi("https://alex.example", "job", fetch)).rejects.toThrow(/connection/i);
  });

  it("rejects an empty address without calling the server", async () => {
    const fetch = fakeFetch(() => Response.json({ pages: [] }));
    await expect(fetchPagesFromApi("   ", "job", fetch)).rejects.toThrow(/address/i);
    expect(fetch.calls).toEqual([]);
  });
});
