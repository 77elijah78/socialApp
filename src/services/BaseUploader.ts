// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileUploadPayload {
  uri: string;
  fieldName: string;
  extraFields?: Record<string, string>;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class BaseUploader {
  protected baseUrl: string;
  protected authToken: string | null;
  protected defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, authToken: string | null = null) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.defaultHeaders = {
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
    };
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  setAuthToken(token: string): void {
    this.authToken = token;
    this.defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    this.authToken = null;
    delete this.defaultHeaders["Authorization"];
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  protected _uploadWithProgress(
    endpoint: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("POST", `${this.baseUrl}${endpoint}`);
      xhr.timeout = 30_000;

      Object.entries(this.defaultHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          reject(
            new Error(`Upload failed [${xhr.status}]: ${xhr.responseText}`),
          );
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new Error("Upload cancelled"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));

      xhr.send(formData);
    });
  }

  // ─── HTTP Helpers ─────────────────────────────────────────────────────────

  protected async _get<T = unknown>(endpoint: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken && {
          Authorization: `Bearer ${this.authToken}`,
        }),
      },
    });

    if (!res.ok) throw new Error(`GET failed [${res.status}]`);
    return res.json() as Promise<T>;
  }

  protected async _delete<T = unknown>(endpoint: string): Promise<T> {
    if (!this.authToken) throw new Error("Auth token required.");

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!res.ok) throw new Error(`DELETE failed [${res.status}]`);
    return res.json() as Promise<T>;
  }

  protected async _patch<T = unknown>(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.authToken) throw new Error("Auth token required.");

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`PATCH failed [${res.status}]`);
    return res.json() as Promise<T>;
  }
}
