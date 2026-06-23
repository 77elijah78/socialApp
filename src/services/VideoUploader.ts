import { BaseUploader } from "./BaseUploader";

interface VideoMetadata {
  userId: string;
  description?: string;
  thumbnail?: string;
  [key: string]: string | undefined;
}

interface VideoUploadResponse {
  videoId: string;
  url: string;
  [key: string]: unknown;
}

interface DeleteResponse {
  success: boolean;
  [key: string]: unknown;
}

const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/mov",
  "video/quicktime",
  "video/webm",
] as const;

type VideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

export class VideoUploader extends BaseUploader {
  private readonly endpoint = "/upload/video";
  private readonly maxSizeMB = 500;

  constructor(baseUrl: string, authToken: string | null = null) {
    super(baseUrl, authToken);
  }

  private _validate(uri: string, mimeType: string, fileSizeMB: number): void {
    if (!uri) throw new Error("Video URI is required.");
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(mimeType as VideoMimeType)) {
      throw new Error(`Unsupported video type: ${mimeType}`);
    }
    if (fileSizeMB > this.maxSizeMB) {
      throw new Error(`Video exceeds max size of ${this.maxSizeMB}MB.`);
    }
  }

  async upload(
    uri: string,
    mimeType: VideoMimeType,
    fileSizeMB: number,
    metadata: Partial<VideoMetadata> = {},
    onProgress?: (percent: number) => void,
  ): Promise<VideoUploadResponse> {
    this._validate(uri, mimeType, fileSizeMB);

    const formData = new FormData();
    formData.append("video", { uri, name: "video", type: mimeType } as any);

    Object.entries(metadata)
      .filter(([, v]) => v !== undefined)
      .forEach(([k, v]) => formData.append(k, String(v)));

    return this._uploadWithProgress(
      this.endpoint,
      formData,
      onProgress,
    ) as Promise<VideoUploadResponse>;
  }

  async getUploadHistory(userId: string): Promise<VideoUploadResponse[]> {
    return this._get<VideoUploadResponse[]>(`/videos?userId=${userId}`);
  }

  async delete(videoId: string): Promise<DeleteResponse> {
    if (!this.authToken)
      throw new Error("Auth token required to delete a video.");

    const res = await fetch(`${this.baseUrl}/videos/${videoId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!res.ok) throw new Error(`Delete failed [${res.status}]`);
    return res.json() as Promise<DeleteResponse>;
  }
}
