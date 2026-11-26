import { describe, expect, it } from "vitest";
import { assertFetchableUrl, createSafeLookup, isPublicAddress } from "./safeUrl";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1",
    "::ffff:10.0.0.1", "::ffff:7f00:1",
  ])("rejects %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "172.32.0.1", "104.16.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])("accepts %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it("rejects strings that are not IP addresses", () => {
    expect(isPublicAddress("example.com")).toBe(false);
  });
});

describe("assertFetchableUrl", () => {
  it("accepts ordinary http and https page URLs", () => {
    expect(assertFetchableUrl("https://duunitori.fi/tyopaikat/tyo/data-engineer-123").href).toBe(
      "https://duunitori.fi/tyopaikat/tyo/data-engineer-123",
    );
    expect(assertFetchableUrl("  http://alex.example/projects  ").hostname).toBe("alex.example");
  });

  it("adds https:// when the scheme is left out", () => {
    expect(assertFetchableUrl("alex.example/projects").href).toBe("https://alex.example/projects");
  });

  it.each([
    ["not a url at all", /valid/i],
    ["ftp://alex.example/cv", /http/i],
    ["file:///etc/passwd", /http/i],
    ["javascript:alert(1)", /http/i],
    ["https://user:secret@alex.example/", /password/i],
    ["https://alex.example:8080/", /port/i],
    ["http://localhost/", /public/i],
    ["http://api.localhost/", /public/i],
    ["http://127.0.0.1/", /public/i],
    ["http://2130706433/", /public/i],
    ["http://[::1]/", /public/i],
    ["http://[::ffff:127.0.0.1]/", /public/i],
    ["http://169.254.169.254/latest/meta-data/", /public/i],
    ["http://intranet/", /public/i],
  ])("rejects %s", (raw, message) => {
    expect(() => assertFetchableUrl(raw)).toThrow(message);
  });
});

describe("createSafeLookup", () => {
  type Result = { err: NodeJS.ErrnoException | null; address?: unknown; family?: number };
  const lookupWith = (addresses: { address: string; family: number }[]) =>
    new Promise<Result>((resolve) => {
      const lookup = createSafeLookup(async () => addresses);
      lookup("alex.example", { all: true }, (err, address, family) => resolve({ err, address, family }));
    });

  it("passes through hosts that resolve only to public addresses", async () => {
    const result = await lookupWith([{ address: "104.16.0.1", family: 4 }]);
    expect(result.err).toBeNull();
    expect(result.address).toEqual([{ address: "104.16.0.1", family: 4 }]);
  });

  it("refuses a host when any of its addresses is private (DNS rebinding defence)", async () => {
    const result = await lookupWith([
      { address: "104.16.0.1", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    expect(result.err?.message).toMatch(/private address/i);
  });

  it("returns a single address when the caller did not ask for all of them", async () => {
    const result = await new Promise<Result>((resolve) => {
      createSafeLookup(async () => [{ address: "104.16.0.1", family: 4 }])("alex.example", {}, (err, address, family) =>
        resolve({ err, address, family }),
      );
    });
    expect(result).toEqual({ err: null, address: "104.16.0.1", family: 4 });
  });
});
