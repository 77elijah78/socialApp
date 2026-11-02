import { API_ORIGIN, isPrivateHost, parseApiOrigin } from "../config/api";

export function isDeviceFileUri(uri: string): boolean {
  return /^(file|content|ph|assets-library|blob):/i.test(uri);
}

/** Normalize only the backend's verified static mount. Never rewrite arbitrary
 * CDN/signed URLs, guess an HTTPS CDN endpoint, or accept device URI payloads. */
export function normalizeMediaUrl(
  value: unknown,
  apiOrigin = API_ORIGIN,
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  if (/[\\\s\u0000-\u001f\u007f]/.test(input)) return null;
  const origin = parseApiOrigin(apiOrigin);
  try {
    const relative = /^\/?uploads\//.test(input);
    if (!/^https?:\/\//i.test(input) && !relative && !input.startsWith("//"))
      return null;
    if ((relative || input.startsWith("//")) && !origin) return null;
    const url = new URL(
      relative ? `/${input.replace(/^\//, "")}` : input,
      origin || undefined,
    );
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return null;
    const base = origin ? new URL(origin) : null;
    const ownedUpload =
      /^\/uploads\/(images|videos|audio)\/[^/]+$/.test(url.pathname) &&
      !/%2f|%5c/i.test(url.pathname);
    if (relative && !ownedUpload) return null;
    if (
      ownedUpload &&
      base &&
      (relative ||
        isPrivateHost(url.hostname) ||
        url.hostname === base.hostname)
    ) {
      // Keep the public route/query, not the backend's internal host/port/protocol.
      return `${base.origin}${url.pathname}${url.search}${url.hash}`;
    }
    if (isPrivateHost(url.hostname) && url.origin !== origin) return null;
    // Preserve exact escaping and signatures of already-valid external URLs.
    return input.startsWith("//") ? `${url.protocol}${input}` : input;
  } catch {
    return null;
  }
}

export function requireRemoteMediaUrl(
  value: unknown,
  apiOrigin = API_ORIGIN,
): string {
  const url = normalizeMediaUrl(value, apiOrigin);
  if (!url)
    throw new Error(
      "The server did not provide a usable public media URL. Please retry or contact support.",
    );
  return url;
}

/** Local sources are allowed only for this device's unconfirmed outgoing row. */
export function displayMediaUrl(value: unknown, pendingLocal = false): string {
  if (pendingLocal && typeof value === "string" && isDeviceFileUri(value))
    return value;
  return normalizeMediaUrl(value) ?? "";
}
