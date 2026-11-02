import { normalizeMediaUrl, requireRemoteMediaUrl } from "../utils/mediaUrls";
import { mediaFileForUpload } from "../utils/mediaUpload";
import { BaseUploader } from "./BaseUploader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaFile {
  url: string;
  thumbnailUrl?: string;
  category: "image" | "video" | "audio";
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  filename: string;
}

export interface UploadResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface LocalFile {
  uri: string;
  name?: string;
  type?: string;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class MediaUploader extends BaseUploader {
  constructor(baseUrl: string, authToken: string | null = null) {
    super(baseUrl, authToken);
  }

  private normalizeFile<T extends { url: string; thumbnailUrl?: string }>(file: T): T {
    return { ...file, url: requireRemoteMediaUrl(file.url, this.baseUrl),
      thumbnailUrl: normalizeMediaUrl(file.thumbnailUrl, this.baseUrl) ?? undefined };
  }

  // ─── Single file (image / video / audio) ──────────────────────────────────
  // Used for: voice messages, video attachments, single image in chat

  async uploadFile(
    file: LocalFile,
    onProgress?: (percent: number) => void,
  ): Promise<MediaFile> {
    const { type: mimeType, name: filename } = mediaFileForUpload(file.uri, { name: file.name, mimeType: file.type });

    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: filename,
      type: mimeType,
    } as unknown as Blob);

    const res = (await this._uploadWithProgress(
      "/api/v1/media/upload",
      formData,
      onProgress,
    )) as UploadResponse<MediaFile>;

    if (!res.success) throw new Error(res.message);
    return this.normalizeFile(res.data);
  }

  // ─── Multiple images (up to 4) ────────────────────────────────────────────
  // Used for: post creation with multiple photos

  async uploadImages(
    files: LocalFile[],
    onProgress?: (percent: number) => void,
  ): Promise<MediaFile[]> {
    if (files.length === 0) throw new Error("No files provided");
    if (files.length > 4) throw new Error("Maximum 4 images allowed");

    const formData = new FormData();

    for (const file of files) {
      const { type: mimeType, name: filename } = mediaFileForUpload(file.uri, { name: file.name, mimeType: file.type });

      formData.append("images", {
        uri: file.uri,
        name: filename,
        type: mimeType,
      } as unknown as Blob);
    }

    const res = (await this._uploadWithProgress(
      "/api/v1/media/upload/images",
      formData,
      onProgress,
    )) as UploadResponse<MediaFile[]>;

    if (!res.success) throw new Error(res.message);
    return res.data.map((file) => this.normalizeFile(file));
  }

  // ─── Avatar ───────────────────────────────────────────────────────────────
  // Used for: profile picture update

  async uploadAvatar(
    file: LocalFile,
    onProgress?: (percent: number) => void,
  ): Promise<{
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  }> {
    const { type: mimeType, name: filename } = mediaFileForUpload(file.uri, { name: file.name, mimeType: file.type });

    const formData = new FormData();
    formData.append("avatar", {
      uri: file.uri,
      name: filename,
      type: mimeType,
    } as unknown as Blob);

    const res = (await this._uploadWithProgress(
      "/api/v1/media/upload/avatar",
      formData,
      onProgress,
    )) as UploadResponse<{
      url: string;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
    }>;

    if (!res.success) throw new Error(res.message);
    return this.normalizeFile(res.data);
  }

  // ─── Voice message shorthand ──────────────────────────────────────────────
  // Wraps uploadFile — just makes call sites cleaner

  async uploadVoice(
    uri: string,
    onProgress?: (percent: number) => void,
  ): Promise<MediaFile> {
    return this.uploadFile(
      { uri, type: "audio/mp4", name: `voice_${Date.now()}.m4a` },
      onProgress,
    );
  }

  // ─── Video message shorthand ──────────────────────────────────────────────

  async uploadVideo(
    uri: string,
    onProgress?: (percent: number) => void,
  ): Promise<MediaFile> {
    return this.uploadFile(
      { uri, type: "video/mp4", name: `video_${Date.now()}.mp4` },
      onProgress,
    );
  }
}
