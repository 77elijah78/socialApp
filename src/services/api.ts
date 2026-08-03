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

  const blob = await _uriToBlob(filePart.uri);
  const arrayBuffer = await _blobToArrayBuffer(blob);
  const boundary = "----Boundary_" + Math.random().toString(16).slice(2);
  const body = _buildMultipartBody(boundary, filePart.fieldName, filePart.filename, filePart.mimeType, arrayBuffer);
  const contentType = `multipart/form-data; boundary=${boundary}`;

  const send = async (tok: string): Promise<any> => {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": contentType,
      },
      body: body as BodyInit,
    });

    if (resp.status === 401) {
      if (isRefreshing) {
        const newToken = await new Promise<string | null>((resolve) => {
          queuePending(resolve);
        });
        if (newToken) return send(newToken);
        throw new Error("Authentication failed");
      }
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      flushPending(newToken);
      if (newToken) return send(newToken);
      throw new Error("Authentication failed");
    }

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({}));
      throw new Error(error.message || `Request failed [${resp.status}]`);
    }

    return resp.json();
  };

  return send(authToken);
}

async function _uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.status}`);
  }
  return response.blob();
}

function _blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function _buildMultipartBody(
  boundary: string,
  fieldName: string,
  filename: string,
  mimeType: string,
  fileData: ArrayBuffer,
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  parts.push(encoder.encode(`--${boundary}\r\n`));
  parts.push(
    encoder.encode(
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`,
    ),
  );
  parts.push(encoder.encode(`Content-Type: ${mimeType}\r\n\r\n`));
  parts.push(new Uint8Array(fileData));
  parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

  const totalLength = parts.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of parts) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
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
