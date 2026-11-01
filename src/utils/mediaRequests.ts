import { API_ORIGIN } from "../config/api";
import { isDeviceFileUri, normalizeMediaUrl } from "./mediaUrls";

export interface MediaRequestSource {
  uri: string;
  headers?: Record<string, string>;
}

/** Credentials belong only to this API's upload mount, never a CDN, a signed
 * external address, a local file or a lookalike host. No token goes in a URL. */
export function isAuthenticatedMediaUrl(uri: string, apiOrigin = API_ORIGIN): boolean {
  if (!apiOrigin || !uri) return false;
  try {
    const url = new URL(uri);
    return url.origin === new URL(apiOrigin).origin &&
      !url.username && !url.password && url.pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}

export function mediaRequestSource(
  value: string | null | undefined,
  token: string | null,
  apiOrigin = API_ORIGIN,
): MediaRequestSource {
  const uri = value && isDeviceFileUri(value)
    ? value : normalizeMediaUrl(value, apiOrigin) ?? "";
  return {
    uri,
    ...(token && isAuthenticatedMediaUrl(uri, apiOrigin)
      ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}

/** Native loaders expose HTTP status in different shapes. Do not interpret
 * arbitrary URI digits or a generic codec/network error as an auth failure. */
export function mediaHttpStatus(error: unknown): 401 | 403 | null {
  return readMediaHttpStatus(error, 0);
}
function readMediaHttpStatus(error: unknown, depth: number): 401 | 403 | null {
  if (depth > 4) return null;
  if (error && typeof error === "object") {
    const value = error as { status?: unknown; statusCode?: unknown; error?: unknown; message?: unknown; nativeEvent?: unknown };
    if (value.status === 401 || value.status === 403) return value.status;
    if (value.statusCode === 401 || value.statusCode === 403) return value.statusCode;
    for (const nested of [value.nativeEvent, value.error, value.message]) {
      if (nested && nested !== error) {
        const status = readMediaHttpStatus(nested, depth + 1);
        if (status) return status;
      }
    }
  }
  if (typeof error !== "string") return null;
  const status = /(?:\bHTTP(?:\/\d(?:\.\d)?)?\s*[:\[=-]?\s*|\b(?:response|status)(?:\s*code)?\s*[:\[=-]?\s*)(401|403)\b/i.exec(error.slice(0, 4096));
  return status ? Number(status[1]) as 401 | 403 : null;
}

/** Advisory only, not JWT verification. Expo Audio can surface just "Source
 * error" instead of the underlying HTTP code. A known-expired JWT permits the
 * same single auth retry; valid-token codec/network failures do not. */
export function mediaTokenExpired(token: string, now = Date.now()): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload || payload.length > 8192) return false;
    const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return typeof exp === "number" && Number.isFinite(exp) && exp * 1000 <= now;
  } catch { return false; }
}
