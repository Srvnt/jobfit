import { describe, expect, it } from "vitest";
import { createRequestGuard } from "./requestGuard";

const DNS: Record<string, string[]> = {
  "alex.example": ["104.16.0.1"],
  "cdn.example": ["104.16.0.2", "2606:4700::1"],
  "rebind.example": ["104.16.0.3", "10.0.0.7"],
  "localtest.me": ["127.0.0.1"],
};

function guardWithDns() {
  const lookups: string[] = [];
  const guard = createRequestGuard(async (host) => {
    lookups.push(host);
    const addresses = DNS[host];
    if (!addresses) throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  });
  return { guard, lookups };
}

describe("createRequestGuard", () => {
  it("allows the page and its scripts and data from public hosts", async () => {
    const { guard } = guardWithDns();
    expect(await guard("https://alex.example/", "document")).toBe(true);
    expect(await guard("https://cdn.example/assets/index.js", "script")).toBe(true);
    expect(await guard("https://alex.example/api/projects.json", "fetch")).toBe(true);
    expect(await guard("https://alex.example/api/projects", "xhr")).toBe(true);
    // Stylesheets decide which elements are blocks, so the visible text needs them.
    expect(await guard("https://cdn.example/assets/index.css", "stylesheet")).toBe(true);
  });

  it("blocks images, fonts and media, which don't add text", async () => {
    const { guard, lookups } = guardWithDns();
    for (const type of ["image", "font", "media"]) {
      expect(await guard("https://alex.example/x", type)).toBe(false);
    }
    expect(lookups).toEqual([]);
  });

  it.each([
    "http://localhost:3000/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://intranet/",
    "file:///etc/passwd",
    "chrome://settings",
    "ftp://alex.example/",
    "https://localtest.me/",
    "https://rebind.example/",
    "https://unknown.example/",
  ])("blocks %s", async (url) => {
    const { guard } = guardWithDns();
    expect(await guard(url, "fetch")).toBe(false);
  });

  it("allows data: and blob: URLs, which never leave the browser", async () => {
    const { guard } = guardWithDns();
    expect(await guard("data:application/json,{}", "fetch")).toBe(true);
    expect(await guard("blob:https://alex.example/123", "script")).toBe(true);
  });

  it("looks up each host only once", async () => {
    const { guard, lookups } = guardWithDns();
    await guard("https://alex.example/a.js", "script");
    await guard("https://alex.example/b.js", "script");
    await guard("https://alex.example/", "document");
    expect(lookups).toEqual(["alex.example"]);
  });
});
