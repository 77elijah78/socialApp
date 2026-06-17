import * as FileSystem from "expo-file-system";

export class BaseUploader {
  constructor(baseUrl, authToken = null) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.defaultHeaders = {
      "Content-Type": "multipart/form-data",
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
    };
  }

  /**
   * Set or update the auth token (e.g., after login)
   */
  setAuthToken(token) {
    this.authToken = token;
    this.defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  /**
   * Core upload using expo-file-system for progress tracking.
   * Falls back to fetch for non-file payloads.
   */
  async _uploadWithProgress(endpoint, formData, onProgress = null) {
    const url = `${this.baseUrl}${endpoint}`;

    if (onProgress) {
      // expo-file-system uploadAsync supports progress callbacks
      const uploadTask = FileSystem.createUploadTask(
        url,
        formData.uri, // local file uri
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: formData.fieldName,
          headers: this.defaultHeaders,
          parameters: formData.extraFields ?? {},
        },
        (progress) => {
          const pct =
            progress.totalBytesSent / progress.totalBytesExpectedToSend;
          onProgress(Math.round(pct * 100));
        }
      );
      const result = await uploadTask.uploadAsync();
      return JSON.parse(result.body);
    }

    // Standard fetch fallback (text, small payloads)
    const res = await fetch(url, {
      method: "POST",
      headers: this.defaultHeaders,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upload failed [${res.status}]: ${err}`);
    }
    return res.json();
  }

  /**
   * Generic GET helper shared across all services
   */
  async _get(endpoint) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken && {
          Authorization: `Bearer ${this.authToken}`,
        }),
      },
    });
    if (!res.ok) throw new Error(`GET failed [${res.status}]`);
    return res.json();
  }
}
