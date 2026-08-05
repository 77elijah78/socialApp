import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.5:3000"}/api/v1`;

let currentToken: string | null = null;
let currentRefreshToken: string | null = null;
let onTokenRefresh: ((token: string, refreshToken?: string) => void) | null = null;

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

let isRefreshing = false;
let pendingRequests: ((token: string | null) => void)[] = [];

function queuePending(cb: (token: string | null) => void) {
  pendingRequests.push(cb);
}

function flushPending(token: string | null) {
  pendingRequests.forEach((cb) => cb(token));
  pendingRequests = [];
}

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

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const body = options.body;

  const isJsonBody = typeof body === "string";
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (isJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  const authToken = token ?? currentToken;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 429 rate limiting with retry
  if (response.status === 429) {
    console.log("[api.ts] 429 rate limited for", path, "- retrying after 1s");
    const retryAfter = response.headers.get("Retry-After");
    const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 3000)));
    const retry = await fetch(url, { ...options, headers });
    if (!retry.ok) {
      const error = await retry.json().catch(() => ({}));
      throw new Error(error.message || `Request failed [${retry.status}]`);
    }
    return retry.json();
  }

  if (response.status === 401) {
    console.log("[api.ts] 401 received for", path, "- attempting refresh (isRefreshing:", isRefreshing, ")");
    if (isRefreshing) {
      const newToken = await new Promise<string | null>((resolve) => {
        queuePending(resolve);
      });
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        const retry = await fetch(url, {
          ...options,
          headers,
        });
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
      flushPending(newToken);

      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        const retry = await fetch(url, {
          ...options,
          headers,
        });
        if (!retry.ok) {
          const error = await retry.json().catch(() => ({}));
          throw new Error(error.message || `Request failed [${retry.status}]`);
        }
        return retry.json();
      }

      throw new Error("Authentication failed");
    } catch (err) {
      isRefreshing = false;
      flushPending(null);
      throw err;
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed [${response.status}]`);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: "GET" }, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: "DELETE" }, token),
   upload: (path: string, formData: FormData, token?: string): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> =>
    _uploadFile(path, formData, token),
   uploadFile: (
    path: string,
    uri: string,
    mimeType: string,
    fieldName: string = "file",
    filename?: string,
    token?: string,
  ): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> =>
    _uploadFile(path, _buildFormData(uri, mimeType, fieldName, filename), token),
};

async function _uploadFile(
  path: string,
  formData: FormData,
  token?: string,
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
    const newToken = await new Promise<string | null>((resolve) => {
      queuePending(resolve);
    });
    return newToken;
  }

  isRefreshing = true;
  const newToken = await refreshAccessToken();
  isRefreshing = false;
  flushPending(newToken);
  return newToken;
}

function _sendXHR(
  url: string,
  formData: FormData,
  authToken: string,
): Promise<{ success: boolean; data: MediaUploadResponse; message?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 60000;
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
  filename?: string,
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
