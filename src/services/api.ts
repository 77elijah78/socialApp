const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.3:3000"}/api/v1`;

let currentToken: string | null = null;
let currentRefreshToken: string | null = null;

export function setTokens(token: string | null, refreshToken: string | null) {
  currentToken = token;
  if (refreshToken) {
    currentRefreshToken = refreshToken;
  }
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
    return null;
  }
  try {
    const resp = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const newToken = data.data?.accessToken ?? data.accessToken;
    if (newToken) {
      currentToken = newToken;
      if (data.data?.refreshToken) {
        currentRefreshToken = data.data.refreshToken;
      }
      return newToken;
    }
    return null;
  } catch {
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

  if (response.status === 401) {
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
  upload: (path: string, formData: FormData, token?: string) =>
    request<{ success: boolean; data: MediaUploadResponse; message?: string }>(
      path,
      { method: "POST", body: formData },
      token,
    ),
};

export default api;
