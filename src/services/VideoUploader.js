import { BaseUploader } from "./BaseUploader";

export class VideoUploader extends BaseUploader {
  constructor(baseUrl, authToken = null) {
    super(baseUrl, authToken);
    this.endpoint = "/upload/video";
    this.allowedMimeTypes = ["video/mp4", "video/mov", "video/quicktime", "video/webm"];
    this.maxSizeMB = 500;
  }

  /**
   * Validate the video before uploading
   */
  _validate(uri, mimeType, fileSizeMB) {
    if (!uri) throw new Error("Video URI is required.");
    if (!this.allowedMimeTypes.includes(mimeType)) {
      throw new Error(`Unsupported video type: ${mimeType}`);
    }
    if (fileSizeMB > this.maxSizeMB) {
      throw new Error(`Video exceeds max size of ${this.maxSizeMB}MB.`);
    }
  }

  /**
   * Upload a video file.
   *
   * @param {string}   uri         - Local file URI from expo-image-picker / expo-camera
   * @param {string}   mimeType    - e.g. "video/mp4"
   * @param {number}   fileSizeMB  - File size in MB for validation
   * @param {object}   metadata    - Extra fields: { userId, description, thumbnail? }
   * @param {function} onProgress  - Optional (percent: number) => void callback
   * @returns {Promise<object>}    - Server response { videoId, url, ... }
   */
  async upload(uri, mimeType, fileSizeMB, metadata = {}, onProgress = null) {
    this._validate(uri, mimeType, fileSizeMB);

    return this._uploadWithProgress(
      this.endpoint,
      {
        uri,
        fieldName: "video",
        extraFields: {
          mimeType,
          ...metadata,
        },
      },
      onProgress
    );
  }

  /**
   * Fetch video upload history for the current user
   * @param {string} userId
   */
  async getUploadHistory(userId) {
    return this._get(`/videos?userId=${userId}`);
  }

  /**
   * Delete a previously uploaded video
   * @param {string} videoId
   */
  async delete(videoId) {
    const res = await fetch(`${this.baseUrl}/videos/${videoId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });
    if (!res.ok) throw new Error(`Delete failed [${res.status}]`);
    return res.json();
  }
}
