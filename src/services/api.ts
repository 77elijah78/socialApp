import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.3:3000"}/api/v1`;
const DEFAULT_TIMEOUT = 30_000; // 30 seconds

let currentToken: string | null = null;
let currentRefreshToken: string | null = null;
let onTokenRefresh: ((token: string, refreshToken?: string) => void) | null = null;

// Request deduplication for GET requests
const pendingGetRequests = new Map<string, Promise<any>>();

// Token refresh state
let isRefreshing = false;
let pendingRefreshCallbacks: ((token: string | null) => void)[] = [];

export function setTokens(token: string | null, refreshToken: string | null) {
  currentToken = token;
  if (refreshToken) {
    currentRefreshToken = refreshToken;
  }
}

export function setTokenRefreshCallback(cb: typeof onTokenRefresh) {
  onTokenRefresh = cb;
}

export function getAccessToken(): string | null {
  return currentToken;
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

  const url = `${BASE_URL}${path}`;
  const body = fetchOptions.body;

  const isJsonBody = typeof body === "string";
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };

  if (isJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  const authToken = token ?? currentToken;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  // Deduplication key for GET requests
  const dedupeKey = deduplicate && fetchOptions.method === "GET" ? `${path}?${JSON.stringify(fetchOptions)}` : null;

  // Check for existing pending GET request
  if (dedupeKey && pendingGetRequests.has(dedupeKey)) {
    return pendingGetRequests.get(dedupeKey) as Promise<T>;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Handle external signal
  let aborted = false;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort());
    }
  }

  const performRequest = async (attemptToken: string | null): Promise<Response> => {
    const requestHeaders = { ...headers };
    if (attemptToken) {
      requestHeaders.Authorization = `Bearer ${attemptToken}`;
    }

    return fetch(url, {
      ...fetchOptions,
      headers: requestHeaders,
      signal: controller.signal,
    });
  };

  let response: Response;

  try {
    response = await performRequest(authToken);
  } catch (err) {
    clearTimeout(timeoutId);
    if (dedupeKey) pendingGetRequests.delete(dedupeKey);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw err;
  }

  clearTimeout(timeoutId);

  // Handle 429 rate limiting with retry
  if (response.status === 429) {
    console.log("[api.ts] 429 rate limited for", path, "- retrying after 1s");
    const retryAfter = response.headers.get("Retry-After");
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 3000)));
    
    const retry = await fetch(url, { ...fetchOptions, headers });
    if (dedupeKey) pendingGetRequests.delete(dedupeKey);
    if (!retry.ok) {
      const error = await retry.json().catch(() => ({}));
      throw new Error(error.message || `Request failed [${retry.status}]`);
    }
    return retry.json();
  }

  // Handle 401 with token refresh
  if (response.status === 401) {
    console.log("[api.ts] 401 received for", path, "- attempting refresh");
    
    if (isRefreshing) {
      // Wait for ongoing refresh
      const newToken = await new Promise<string | null>((resolve) => {
        pendingRefreshCallbacks.push(resolve);
      });
      
      if (newToken) {
        const retry = await performRequest(newToken);
        if (dedupeKey) pendingGetRequests.delete(dedupeKey);
        if (!retry.ok) {
          const error = await retry.json().catch(() => ({}));
          throw new Error(error.message || `Request failed [${retry.status}]`);
        }
        return retry.json();
      }
      throw new Error("Authentication failed");
    }

    isRefreshing = true;
    try {
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      
      // Notify all waiters
      pendingRefreshCallbacks.forEach((cb) => cb(newToken));
      pendingRefreshCallbacks = [];

      if (newToken) {
        const retry = await performRequest(newToken);
        if (dedupeKey) pendingGetRequests.delete(dedupeKey);
        if (!retry.ok) {
          const error = await retry.json().catch(() => ({}));
          throw new Error(error.message || `Request failed [${retry.status}]`);
        }
        return retry.json();
      }

      throw new Error("Authentication failed");
    } catch (err) {
      isRefreshing = false;
      pendingRefreshCallbacks.forEach((cb) => cb(null));
      pendingRefreshCallbacks = [];
      if (dedupeKey) pendingGetRequests.delete(dedupeKey);
      throw err;
    }
  }

  if (!response.ok) {
    if (dedupeKey) pendingGetRequests.delete(dedupeKey);
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed [${response.status}]`);
  }

  if (dedupeKey) pendingGetRequests.delete(dedupeKey);
  return response.json();
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  if (!currentRefreshToken) {
    try {
      const stored = await AsyncStorage.getItem("refreshToken");
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
  try {
    const resp = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      console.warn("[api.ts] refreshAccessToken: refresh failed", resp.status, errBody.message);
      return null;
    }
    const data = await resp.json();
    const newToken = data.data?.accessToken ?? data.accessToken;
    if (newToken) {
      currentToken = newToken;
      if (data.data?.refreshToken) {
        currentRefreshToken = data.data.refreshToken;
      }
      if (onTokenRefresh) {
        try {
          onTokenRefresh(newToken, data.data?.refreshToken);
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
  }
}

export const api = {
  /**
   * GET request with optional deduplication and AbortSignal support
   */
  get: <T>(
    path: string,
    token?: string,
    options?: ApiRequestOptions
  ) => request<T>(path, { method: "GET", deduplicate: true, ...options }, token),

  /**
   * POST request with AbortSignal support
   */
  post: <T>(
    path: string,
    body: unknown,
    token?: string,
    options?: ApiRequestOptions
  ) => request<T>(path, { method: "POST", body: JSON.stringify(body), ...options }, token),

  /**
   * PATCH request with AbortSignal support
   */
  patch: <T>(
    path: string,
    body: unknown,
    token?: string,
    options?: ApiRequestOptions
  ) => request<T>(path, { method: "PATCH", body: JSON.stringify(body), ...options }, token),

  /**
   * DELETE request with AbortSignal support
   */
  delete: <T>(
    path: string,
    token?: string,
    options?: ApiRequestOptions
  ) => request<T>(path, { method: "DELETE", ...options }, token),

  /**
   * Upload file with FormData
   */
  upload: (
    path: string,
    formData: FormData,
    token?: string
  ): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> =>
    _uploadFile(path, formData, token),

  /**
   * Upload file from URI
   */
  uploadFile: (
    path: string,
    uri: string,
    mimeType: string,
    fieldName: string = "file",
    filename?: string,
    token?: string
  ): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> =>
    _uploadFile(path, _buildFormData(uri, mimeType, fieldName, filename), token),
};

async function _uploadFile(
  path: string,
  formData: FormData,
  token?: string
): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> {
  const url = `${BASE_URL}${path}`;
  let authToken = token ?? currentToken;

  if (!authToken) {
    throw new Error("No authentication token available");
  }

  const filePart = _extractFileFromFormData(formData);
  if (!filePart) {
    throw new Error("No file found in FormData");
  }

  const form = new FormData();
  form.append(filePart.fieldName, {
    uri: filePart.uri,
    name: filePart.filename,
    type: filePart.mimeType,
  } as any);

  try {
    return await _sendXHR(url, form, authToken);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("401")) {
      const newToken = await _getRefreshedToken();
      if (newToken) {
        return _sendXHR(url, form, newToken);
      }
    }
    throw err;
  }
}

async function _getRefreshedToken(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise<string | null>((resolve) => {
      pendingRefreshCallbacks.push(resolve);
    });
  }

  isRefreshing = true;
  const newToken = await refreshAccessToken();
  isRefreshing = false;
  
  pendingRefreshCallbacks.forEach((cb) => cb(newToken));
  pendingRefreshCallbacks = [];
  
  return newToken;
}

function _sendXHR(
  url: string,
  formData: FormData,
  authToken: string
): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 60_000;
    xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        console.log(`Upload progress: ${pct}%`);
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
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    xhr.send(formData);
  });
}

function _buildFormData(
  uri: string,
  mimeType: string,
  fieldName: string,
  filename?: string
): FormData {
  const name = filename ?? (uri.split("/").pop() ?? "upload");
  const form = new FormData();
  form.append(fieldName, {
    uri,
    name,
    type: mimeType,
  } as any);
  return form;
}

interface FilePart {
  uri: string;
  fieldName: string;
  mimeType: string;
  filename: string;
}

function _extractFileFromFormData(formData: FormData): FilePart | null {
  const entries = (formData as any)._parts ?? (formData as any)._entries ?? [];
  for (const entry of entries) {
    const value = entry[1];
    if (typeof value === "object" && value !== null && "uri" in value && "name" in value) {
      return {
        uri: (value as any).uri,
        fieldName: entry[0],
        mimeType: (value as any).type ?? "application/octet-stream",
        filename: (value as any).name,
      };
    }
  }
  if (typeof (formData as any).entries === "function") {
    for (const [name, value] of (formData as any).entries()) {
      if (typeof value === "object" && value !== null && "uri" in value && "name" in value) {
        return {
          uri: (value as any).uri,
          fieldName: name,
          mimeType: (value as any).type ?? "application/octet-stream",
          filename: (value as any).name,
        };
      }
    }
  }
  return null;
}

export default api;