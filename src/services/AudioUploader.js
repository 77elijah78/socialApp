import { BaseUploader } from "./BaseUploader";

export class AudioUploader extends BaseUploader {
  constructor(baseUrl, authToken = null) {
    super(baseUrl, authToken);
    this.endpoint = "/upload/audio";
    this.allowedMimeTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/m4a", "audio/aac"];
    this.maxSizeMB = 100;
  }

  /**
   * Validate audio before uploading
   */
  _validate(uri, mimeType, fileSizeMB) {
    if (!uri) throw new Error("Audio URI is required.");
    if (!this.allowedMimeTypes.includes(mimeType)) {
      throw new Error(`Unsupported audio type: ${mimeType}`);
    }
    if (fileSizeMB > this.maxSizeMB) {
      throw new Error(`Audio exceeds max size of ${this.maxSizeMB}MB.`);
    }
  }

  /**
   * Upload an audio file.
   *
   * @param {string}   uri         - Local file URI from expo-av recording or file picker
   * @param {string}   mimeType    - e.g. "audio/mpeg"
   * @param {number}   fileSizeMB  - File size in MB for validation
   * @param {object}   metadata    - Extra fields: { userId, title, duration? }
   * @param {function} onProgress  - Optional (percent: number) => void callback
   * @returns {Promise<object>}    - Server response { audioId, url, ... }
   */
  async upload(uri, mimeType, fileSizeMB, metadata = {}, onProgress = null) {
    this._validate(uri, mimeType, fileSizeMB);

    return this._uploadWithProgress(
      this.endpoint,
      {
        uri,
        fieldName: "audio",
        extraFields: {
          mimeType,
          ...metadata,
        },
      },
      onProgress
    );
  }

  /**
   * Upload audio recorded directly from expo-av
   * Convenience wrapper — handles the Recording URI automatically.
   *
   * @param {import("expo-av").Audio.Recording} recording - Expo recording instance
   * @param {object} metadata
   * @param {function} onProgress
   */
  async uploadFromRecording(recording, metadata = {}, onProgress = null) {
    const uri = recording.getURI();
    if (!uri) throw new Error("Recording URI is null. Did you stop the recording?");

    return this.upload(uri, "audio/m4a", 0, metadata, onProgress);
  }

  /**
   * Fetch audio upload history
   * @param {string} userId
   */
  async getUploadHistory(userId) {
    return this._get(`/audios?userId=${userId}`);
  }
}
