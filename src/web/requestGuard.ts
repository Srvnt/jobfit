import type { LookupAddress } from "node:dns";
import { assertFetchableUrl, isPublicAddress } from "./safeUrl.js";

/**
 * Decides which requests a headless browser may make while rendering a JavaScript site.
 * The page's own scripts can request any address, so every request gets the same SSRF
 * checks as the plain fetcher. Resource types that never add text are skipped to save time.
 */

const SKIPPED_TYPES = new Set(["image", "font", "media", "texttrack", "manifest", "imageset"]);

type Resolver = (hostname: string) => Promise<LookupAddress[]>;

export function createRequestGuard(resolve: Resolver) {
  const hostIsPublic = new Map<string, Promise<boolean>>();

  const checkHost = (hostname: string) => {
    let result = hostIsPublic.get(hostname);
    if (!result) {
      result = resolve(hostname).then(
        (addresses) => addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address)),
        () => false,
      );
      hostIsPublic.set(hostname, result);
    }
    return result;
  };

  return async (url: string, resourceType: string): Promise<boolean> => {
    if (SKIPPED_TYPES.has(resourceType)) return false;
    if (/^(data|blob):/i.test(url)) return true;
    let parsed: URL;
    try {
      parsed = assertFetchableUrl(url);
    } catch {
      return false;
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    // IP literals were already checked by assertFetchableUrl; names need a DNS answer.
    return isPublicAddress(host) || checkHost(host);
  };
}
