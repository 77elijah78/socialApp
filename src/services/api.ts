import { normalizeMediaUrl, requireRemoteMediaUrl } from "../utils/mediaUrls";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiUrl } from "../config/api";

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

let currentToken: string | null = null;
let currentRefreshToken: string | null = null;
let onTokenRefresh: ((token: string, refreshToken?: string) => void) | null =
  null;

// Request deduplication for GET requests
const pendingGetRequests = new Map<string, Promise<any>>();

// Token refresh state
let authGeneration = 0;
let allowStoredRefresh = true;
let refreshInFlight: {
  generation: number;
  work: Promise<string | null>;
} | null = null;

export function setTokens(token: string | null, refreshToken: string | null) {
  if (token !== currentToken || refreshToken !== currentRefreshToken) {
    authGeneration += 1;
    refreshInFlight = null;
    pendingGetRequests.clear();
  }
  currentToken = token;
  currentRefreshToken = refreshToken;
  allowStoredRefresh = Boolean(token || refreshToken);
}

export function setTokenRefreshCallback(cb: typeof onTokenRefresh) {
  onTokenRefresh = cb;
}

export function getAccessToken(): string | null {
  return currentToken;
}

/** Native image/player/file requests share this HTTP identity and refresh flight;
 * never let a callback from an old account refresh or retry under a new login. */
export function getAuthGeneration(): number {
  return authGeneration;
}

export async function refreshMediaAccessToken(
  attemptedToken: string,
  generation: number,
): Promise<string | null> {
  if (generation !== authGeneration || !currentToken) return null;
  if (currentToken !== attemptedToken) return currentToken;
  const refreshed = await _getRefreshedToken();
  return generation === authGeneration ? refreshed : null;
}

export interface MediaUploadResponse {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  category: string;
  mimeType: string;
  size: number;
  filename: string;
}

export interface ApiRequestOptions extends RequestInit {
  timeout?: number;
  signal?: AbortSignal;
  deduplicate?: boolean; // Only for GET requests
}

/**
 * Core request function with timeout, deduplication, and token refresh handling
 */
async function request<T>(
  path: string,
  options: ApiRequestOptions = {},
  token?: string | null,
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    signal,
    deduplicate = false,
    ...fetchOptions
  } = options;

  const generation = authGeneration;
  const url = apiUrl(path);
  const body = fetchOptions.body;

  const isJsonBody = typeof body === "string";
  const headers: Record<string, string> = {
    ...((fetchOptions.headers as Record<string, string>) ?? {}),
  };

  if (isJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  const authToken = token ?? currentToken;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  // Deduplication key for GET requests
  const dedupeKey =
    deduplicate && !signal && fetchOptions.method === "GET"
      ? `${generation}:${authToken ?? "anonymous"}:${timeout}:${path}?${JSON.stringify(fetchOptions)}`
      : null;

  // Check for existing pending GET request
  if (dedupeKey && pendingGetRequests.has(dedupeKey)) {
    return pendingGetRequests.get(dedupeKey) as Promise<T>;
  }

  const work = (async (): Promise<T> => {
    // Create abort controller for timeout
    const controller = new AbortController();

    // Handle external signal
    const abort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", abort, { once: true });
      }
    }

    const performRequest = async (
      attemptToken: string | null,
    ): Promise<Response> => {
      const requestHeaders = { ...headers };
      if (attemptToken) {
        requestHeaders.Authorization = `Bearer ${attemptToken}`;
      }

      const timeoutId = setTimeout(abort, timeout);
      try {
        return await fetch(url, {
          ...fetchOptions,
          headers: requestHeaders,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      let response: Response;

      try {
        response = await performRequest(authToken);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Request timeout");
        }
        throw err;
      }

      // Handle 429 rate limiting with retry
      if (response.status === 429) {
        console.log(
          "[api.ts] 429 rate limited for",
          path,
          "- retrying after 1s",
        );
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, 3000)),
        );

        if (generation !== authGeneration)
          throw new Error("Authentication changed during request");
        const retry = await performRequest(authToken);
        if (!retry.ok) {
          const error = await retry.json().catch(() => ({}));
          throw new Error(error.message || `Request failed [${retry.status}]`);
        }
        return await retry.json();
      }

      // Handle 401 with token refresh
      if (response.status === 401) {
        console.log("[api.ts] 401 received for", path, "- attempting refresh");

        if (generation !== authGeneration)
          throw new Error("Authentication changed during request");
        const newToken = await _getRefreshedToken();
        if (!newToken || generation !== authGeneration)
          throw new Error("Authentication failed");
        const retry = await performRequest(newToken);
        if (!retry.ok) {
          const error = await retry.json().catch(() => ({}));
          throw new Error(error.message || `Request failed [${retry.status}]`);
        }
        return await retry.json();
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Request failed [${response.status}]`);
      }

      return await response.json();
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  })();
  if (dedupeKey) {
    pendingGetRequests.set(dedupeKey, work);
    void work
      .finally(() => {
        if (pendingGetRequests.get(dedupeKey) === work)
          pendingGetRequests.delete(dedupeKey);
      })
      .catch(() => {});
  }
  return work;
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(generation: number): Promise<string | null> {
  if (!allowStoredRefresh || generation !== authGeneration) return null;
  if (!currentRefreshToken) {
    try {
      const stored = await AsyncStorage.getItem("refreshToken");
      if (generation !== authGeneration) return null;
      if (stored) {
        currentRefreshToken = stored;
      }
    } catch {
      // ignore
    }
  }
  if (!currentRefreshToken) {
    console.warn("[api.ts] refreshAccessToken: no refresh token available");
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const resp = await fetch(apiUrl("/auth/refresh"), {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      console.warn(
        "[api.ts] refreshAccessToken: refresh failed",
        resp.status,
        errBody.message,
      );
      return null;
    }
    const data = await resp.json();
    if (generation !== authGeneration) return null;
    const newToken = data.data?.accessToken ?? data.accessToken;
    if (newToken) {
      currentToken = newToken;
      if (data.data?.refreshToken) {
        currentRefreshToken = data.data.refreshToken;
      }
      if (onTokenRefresh) {
        try {
          onTokenRefresh(newToken, currentRefreshToken ?? undefined);
        } catch (cbErr) {
          console.warn("[api.ts] onTokenRefresh callback threw:", cbErr);
        }
      }
      return newToken;
    }
    console.warn("[api.ts] refreshAccessToken: no accessToken in response");
    return null;
  } catch (err) {
    console.warn("[api.ts] refreshAccessToken: network error", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  /**
   * GET request with optional deduplication and AbortSignal support
   */
  get: <T>(path: string, token?: string, options?: ApiRequestOptions) =>
    request<T>(path, { method: "GET", deduplicate: true, ...options }, token),

  /**
   * POST request with AbortSignal support
   */
  post: <T>(
    path: string,
    body: unknown,
    token?: string,
    options?: ApiRequestOptions,
  ) =>
    request<T>(
      path,
      { method: "POST", body: JSON.stringify(body), ...options },
      token,
    ),

  /**
   * PATCH request with AbortSignal support
   */
  patch: <T>(
    path: string,
    body: unknown,
    token?: string,
    options?: ApiRequestOptions,
  ) =>
    request<T>(
      path,
      { method: "PATCH", body: JSON.stringify(body), ...options },
      token,
    ),

  /**
   * DELETE request with AbortSignal support
   */
  delete: <T>(path: string, token?: string, options?: ApiRequestOptions) =>
    request<T>(path, { method: "DELETE", ...options }, token),

  /**
   * Upload file with FormData
   */
  upload: (
    path: string,
    formData: FormData,
    token?: string,
  ): Promise<{
    success: boolean;
    data: MediaUploadResponse;
    message?: string;
  }> => _uploadFile(path, formData, token),

  /**
   * Upload file from URI
   */
  uploadFile: (
    path: string,
    uri: string,
    mimeType: string,
    fieldName: string = "file",
    filename?: string,
    token?: string,
  ): Promise<{
    success: boolean;
    data: MediaUploadResponse;
    message?: string;
  }> =>
    _uploadFile(
      path,
      _buildFormData(uri, mimeType, fieldName, filename),
      token,
    ),
};

async function _uploadFile(
  path: string,
  formData: FormData,
  token?: string,
): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> {
  const generation = authGeneration;
  const url = apiUrl(path);
  const authToken = token ?? currentToken;

  if (!authToken) {
    throw new Error("No authentication token available");
  }

  const response = await uploadMultipart<{ success: boolean; data: MediaUploadResponse; message?: string }>(url, formData, authToken, undefined, generation);
  if (!response.success || !response.data) throw new Error(response.message || "Upload was not confirmed");
  return { ...response, data: { ...response.data, url: requireRemoteMediaUrl(response.data.url),
    thumbnailUrl: normalizeMediaUrl(response.data.thumbnailUrl) ?? undefined } };
}

/** The same refresh single-flight/generation guard as JSON HTTP. Keep the whole
 * multipart body (all files and fields), including on the one authenticated retry. */
export async function uploadMultipart<T = unknown>(
  url: string,
  formData: FormData,
  token?: string | null,
  onProgress?: (percent: number) => void,
  generation = authGeneration,
): Promise<T> {
  if (!/^https?:\/\//i.test(url)) apiUrl(""); // actionable missing-config error
  const authToken = token ?? currentToken;
  if (!authToken) throw new Error("No authentication token available");
  try {
    const response = await _sendXHR<T>(url, formData, authToken, onProgress);
    if (generation !== authGeneration) throw new Error("Authentication changed during upload");
    return response;
  } catch (error) {
    if (error instanceof UploadHttpError && error.status === 401 && generation === authGeneration) {
      const newToken = await _getRefreshedToken();
      if (newToken && generation === authGeneration) {
        const response = await _sendXHR<T>(url, formData, newToken, onProgress);
        if (generation !== authGeneration) throw new Error("Authentication changed during upload");
        return response;
      }
    }
    throw error;
  }
}

class UploadHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function _getRefreshedToken(): Promise<string | null> {
  if (refreshInFlight?.generation === authGeneration)
    return refreshInFlight.work;
  const flight = {
    generation: authGeneration,
    work: refreshAccessToken(authGeneration),
  };
  refreshInFlight = flight;
  void flight.work
    .finally(() => {
      if (refreshInFlight === flight) refreshInFlight = null;
    })
    .catch(() => {});
  return flight.work;
}

function _sendXHR<T>(
  url: string,
  formData: FormData,
  authToken: string,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 60_000;
    xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Failed to parse upload response"));
        }
      } else {
        let errorMsg = `Request failed [${xhr.status}]`;
        try {
          const error = JSON.parse(xhr.responseText);
          errorMsg = `${errorMsg}: ${error.message || "Unknown error"}`;
        } catch {}
        reject(new UploadHttpError(xhr.status, errorMsg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    xhr.send(formData);
  });
}

function _buildFormData(
  uri: string,
  mimeType: string,
  fieldName: string,
  filename?: string,
): FormData {
  const name = filename ?? uri.split("/").pop() ?? "upload";
  const form = new FormData();
  form.append(fieldName, {
    uri,
    name,
    type: mimeType,
  } as any);
  return form;
}

export default api;
