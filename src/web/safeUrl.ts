import { BlockList, isIP } from "node:net";
import type { LookupAddress } from "node:dns";

/**
 * Guards against server-side request forgery: the fetch function must only ever reach public
 * web servers, never localhost, the private network or a cloud metadata endpoint.
 */

const NON_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) NON_PUBLIC.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8],
] as const) NON_PUBLIC.addSubnet(net, prefix, "ipv6");

/** "::ffff:7f00:1" or "::ffff:127.0.0.1" → "127.0.0.1"; anything else unchanged. */
function unmapIpv4(ip: string): string {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (!hex) return ip;
  const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

export function isPublicAddress(ip: string): boolean {
  const address = unmapIpv4(ip.replace(/^\[|\]$/g, ""));
  const version = isIP(address);
  if (version === 0) return false;
  return !NON_PUBLIC.check(address, version === 4 ? "ipv4" : "ipv6");
}

/** Parses user input into a URL that is safe to request, or throws an Error with a user-facing message. */
export function assertFetchableUrl(raw: string): URL {
  const input = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("That doesn't look like a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https addresses are supported.");
  if (url.username || url.password) throw new Error("Addresses with a username or password aren't supported.");
  if (url.port) throw new Error("Addresses with a custom port aren't supported.");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ipLiteral = isIP(unmapIpv4(host)) !== 0;
  const internalName = !ipLiteral && (!host.includes(".") || /(^|\.)(localhost|local|internal)$/i.test(host));
  if (internalName || (ipLiteral && !isPublicAddress(host))) {
    throw new Error("Only public websites can be fetched.");
  }
  return url;
}

type Resolver = (hostname: string) => Promise<LookupAddress[]>;
type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A drop-in for `dns.lookup`, for the HTTP client's connect step: it refuses to connect when the
 * host resolves to any non-public address. Checking at connect time (not just before fetching)
 * also covers redirects and DNS rebinding, where a host resolves differently on the second lookup.
 */
export function createSafeLookup(resolve: Resolver) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
          const err: NodeJS.ErrnoException = new Error(`${hostname} resolves to a private address`);
          err.code = "EPRIVATEADDRESS";
          return callback(err, "");
        }
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
      (err: NodeJS.ErrnoException) => callback(err, ""),
    );
  };
}
