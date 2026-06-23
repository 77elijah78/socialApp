import { AudioRecorder } from "expo-audio";
import { BaseUploader } from "./BaseUploader";

interface AudioMetadata {
  userId: string;
  title?: string;
  duration?: number;
  [key: string]: string | number | undefined;
}

interface AudioUploadResponse {
  audioId: string;
  url: string;
  [key: string]: unknown;
}

const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/m4a",
  "audio/aac",
] as const;

type AudioMimeType = (typeof ALLOWED_AUDIO_MIME_TYPES)[number];

export class AudioUploader extends BaseUploader {
  private readonly endpoint = "/upload/audio";
  private readonly maxSizeMB = 100;

  constructor(baseUrl: string, authToken: string | null = null) {
    super(baseUrl, authToken);
  }

  private _validate(uri: string, mimeType: string, fileSizeMB: number): void {
    if (!uri) throw new Error("Audio URI is required.");
    if (!ALLOWED_AUDIO_MIME_TYPES.includes(mimeType as AudioMimeType)) {
      throw new Error(`Unsupported audio type: ${mimeType}`);
    }
    if (fileSizeMB > this.maxSizeMB) {
      throw new Error(`Audio exceeds max size of ${this.maxSizeMB}MB.`);
    }
  }

  async upload(
    uri: string,
    mimeType: AudioMimeType,
    fileSizeMB: number,
    metadata: Partial<AudioMetadata> = {},
    onProgress?: (percent: number) => void,
  ): Promise<AudioUploadResponse> {
    this._validate(uri, mimeType, fileSizeMB);

    const formData = new FormData();
    formData.append("audio", { uri, name: "audio", type: mimeType } as any);

    Object.entries(metadata)
      .filter(([, v]) => v !== undefined)
      .forEach(([k, v]) => formData.append(k, String(v)));

    return this._uploadWithProgress(
      this.endpoint,
      formData,
      onProgress,
    ) as Promise<AudioUploadResponse>;
  }

  async uploadFromRecording(
    recording: AudioRecorder, // AudioRecorder instead of Audio.Recording
    metadata: Partial<AudioMetadata> = {},
    onProgress?: (percent: number) => void,
  ): Promise<AudioUploadResponse> {
    const uri = recording.uri; // .uri property, not .getURI() method
    if (!uri)
      throw new Error("Recording URI is null. Did you stop the recording?");

    return this.upload(uri, "audio/m4a", 0, metadata, onProgress);
  }

  async getUploadHistory(userId: string): Promise<AudioUploadResponse[]> {
    return this._get<AudioUploadResponse[]>(`/audios?userId=${userId}`);
  }
}
