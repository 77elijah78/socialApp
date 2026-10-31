/** One origin for HTTP, Socket.IO and the backend's public /uploads mount.
 * No implicit LAN/localhost fallback: missing configuration is a request error,
 * not an app-start side effect. Expo inlines this literal environment lookup. */
import { parseApiOrigin } from "./origin";
export { parseApiOrigin, isPrivateHost } from "./origin";

export const API_ORIGIN = parseApiOrigin(process.env.EXPO_PUBLIC_API_URL);
export function requireApiOrigin(): string {
  if (!API_ORIGIN)
    throw new Error(
      "API is not configured. Set EXPO_PUBLIC_API_URL to the server origin and rebuild the app.",
    );
  return API_ORIGIN;
}
export function apiUrl(path: string): string {
  return `${requireApiOrigin()}/api/v1${path}`;
}
