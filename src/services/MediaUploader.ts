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

// ─── MIME helpers ─────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  // Videos
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  // Audio
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

const getMimeType = (uri: string, hint?: string): string => {
  if (hint) return hint;
  const ext = uri.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
};

const getFilename = (uri: string, hint?: string): string => {
  if (hint) return hint;
  return uri.split("/").pop() ?? `file_${Date.now()}`;
};

// ─── Class ────────────────────────────────────────────────────────────────────

export class MediaUploader extends BaseUploader {
  constructor(baseUrl: string, authToken: string | null = null) {
    super(baseUrl, authToken);
  }

  // ─── Single file (image / video / audio) ──────────────────────────────────
  // Used for: voice messages, video attachments, single image in chat

  async uploadFile(
    file: LocalFile,
    onProgress?: (percent: number) => void,
  ): Promise<MediaFile> {
    const mimeType = getMimeType(file.uri, file.type);
    const filename = getFilename(file.uri, file.name);

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
    return res.data;
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
      const mimeType = getMimeType(file.uri, file.type);
      const filename = getFilename(file.uri, file.name);

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
    return res.data;
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
    const mimeType = getMimeType(file.uri, file.type);
    const filename = getFilename(file.uri, file.name);

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
    return res.data;
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
