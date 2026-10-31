import { normalizeMediaUrl } from "../mediaUrls";
import type { MessageRow } from "../../db/schema";

/** Local presentation metadata, derived from existing author/media API fields.
 * These are not new server message fields or another message store. */
export interface MessageAuthorInfo {
  id?: string;
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}
export interface AttachmentInfo {
  name?: string;
  size?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  waveform?: number[];
}
export interface SharedReplyInfo {
  kind: "post" | "story";
  authorName?: string;
  thumbnailUrl?: string | null;
  mediaType?: string;
}
export interface ReplyPreviewModel {
  id: string;
  content: string;
  senderId: string;
  type: string;
  sender?: MessageAuthorInfo;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  attachment?: AttachmentInfo;
  shared?: SharedReplyInfo;
  deleted?: boolean;
  unavailable?: boolean;
}

export function parseMetadata<T>(value?: string | null): T | undefined {
  if (!value || value.length > 65536) return undefined;
  try {
    const result = JSON.parse(value);
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as T)
      : undefined;
  } catch {
    return undefined;
  }
}
export function authorName(
  author?: MessageAuthorInfo,
  fallback = "Unknown sender",
) {
  return author?.displayName?.trim() || author?.username?.trim() || fallback;
}
export function formatDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function formatBytes(bytes?: number) {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0)
    return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export function fileNameFromUri(uri = "") {
  try {
    return decodeURIComponent(
      uri.split(/[?#]/)[0].split("/").pop() || "Document",
    );
  } catch {
    return "Document";
  }
}
export function fileExtension(name = "") {
  return /\.([a-z0-9]{1,10})$/i.exec(name)?.[1]?.toUpperCase() || "FILE";
}
export function fileIcon(
  name: string,
):
  | "document-text-outline"
  | "document-outline"
  | "image-outline"
  | "musical-notes-outline"
  | "videocam-outline"
  | "archive-outline"
  | "code-slash-outline"
  | "grid-outline" {
  const ext = fileExtension(name);
  if (["PDF", "DOC", "DOCX", "TXT", "RTF"].includes(ext))
    return "document-text-outline";
  if (["XLS", "XLSX", "CSV"].includes(ext)) return "grid-outline";
  if (["ZIP", "RAR", "7Z", "GZ", "TAR"].includes(ext)) return "archive-outline";
  if (["JS", "TS", "JSON", "HTML", "CSS", "PY"].includes(ext))
    return "code-slash-outline";
  if (["PNG", "JPG", "JPEG", "WEBP", "HEIC", "GIF"].includes(ext))
    return "image-outline";
  if (["MP3", "WAV", "M4A", "FLAC", "AAC"].includes(ext))
    return "musical-notes-outline";
  if (["MP4", "MOV", "WEBM", "MKV"].includes(ext)) return "videocam-outline";
  return "document-outline";
}
/** Compact presentation snapshots, not truncated serialized shared-message JSON. */
export function compactReplyPreview(input: ReplyPreviewModel): ReplyPreviewModel {
  const type = input.type.toUpperCase();
  let content = input.content || "";
  let shared = input.shared;
  if (type === "SHARED_POST" || type === "SHARED_STORY") {
    const original = parseMetadata<Record<string, unknown>>(content);
    if (original) {
      const text = type === "SHARED_POST" ? original.content : original.caption;
      const image = type === "SHARED_POST" ? original.imageUrl
        : original.mediaType === "image" ? original.mediaUrl : original.thumbnailUrl;
      content = typeof text === "string" ? text : "";
      shared = {
        kind: type === "SHARED_POST" ? "post" : "story",
        authorName: typeof original.authorName === "string" ? original.authorName : undefined,
        thumbnailUrl: typeof image === "string" ? image : undefined,
        mediaType: typeof original.mediaType === "string" ? original.mediaType : undefined,
      };
    } else if (content.trim().startsWith("{")) {
      // Old clients stored a truncated JSON prefix. Never display that as text.
      content = "";
    }
  }
  return {
    ...input, type,
    content: input.deleted ? "" : content.length > 240 ? `${content.slice(0, 239)}…` : content,
    mediaUrl: normalizeMediaUrl(input.mediaUrl),
    thumbnailUrl: normalizeMediaUrl(input.thumbnailUrl),
    ...(input.deleted
      ? { mediaUrl: null, thumbnailUrl: null, attachment: undefined, shared: undefined }
      : {
          shared: shared ? { ...shared, thumbnailUrl: normalizeMediaUrl(shared.thumbnailUrl) } : undefined,
          attachment: input.attachment ? {
            name: input.attachment.name,
            size: input.attachment.size,
            mimeType: input.attachment.mimeType,
          } : undefined,
        }),
  };
}

export function previewThumbnail(message: ReplyPreviewModel) {
  if (message.deleted) return null;
  return normalizeMediaUrl(message.shared?.thumbnailUrl ||
    (message.type === "IMAGE" ? message.thumbnailUrl || message.mediaUrl
      : message.type === "VIDEO" ? message.thumbnailUrl : null));
}

export function previewText(message: Pick<ReplyPreviewModel,
  "type" | "content" | "duration" | "mediaUrl" | "deleted" | "unavailable" | "attachment" | "shared"
>) {
  if (message.deleted) return "Deleted message";
  if (message.unavailable && !message.content) return "Original message not loaded";
  const content = message.content?.trim();
  const duration = formatDuration(message.duration);
  switch (message.type.toUpperCase()) {
    case "IMAGE": return content ? `Photo · ${content}` : "Photo";
    case "VIDEO": return ["Video", duration, content].filter(Boolean).join(" · ");
    case "AUDIO": return [content || "Voice message", duration].filter(Boolean).join(" · ");
    case "DOCUMENT": return [
      message.attachment?.name || content || fileNameFromUri(message.mediaUrl || ""),
      typeof message.attachment?.size === "number" ? formatBytes(message.attachment.size) : "",
    ].filter(Boolean).join(" · ");
    case "SHARED_POST":
    case "SHARED_STORY": return [
      message.type === "SHARED_POST" ? "Shared post" : "Shared story",
      message.shared?.authorName, content,
    ].filter(Boolean).join(" · ");
    default: return (content || "Message").replace(/\s+/g, " ").slice(0, 180);
  }
}

const metadata = new WeakMap<
  MessageRow,
  {
    author?: MessageAuthorInfo;
    attachment?: AttachmentInfo;
    reply?: ReplyPreviewModel;
  }
>();
export function messageMetadata(row: MessageRow) {
  let cached = metadata.get(row);
  if (!cached) {
    cached = {
      author: parseMetadata<MessageAuthorInfo>(row.senderData),
      attachment: parseMetadata<AttachmentInfo>(row.attachmentData),
      reply: parseMetadata<ReplyPreviewModel>(row.replyData),
    };
    metadata.set(row, cached);
  }
  return cached;
}
export function replyPreview(row: MessageRow): ReplyPreviewModel {
  return compactReplyPreview({
    id: row.id || row.localId,
    content: row.deletedAt ? "" : row.content || "",
    type: row.type,
    senderId: row.senderId,
    sender: messageMetadata(row).author,
    mediaUrl: row.deletedAt ? null : row.mediaUrl,
    thumbnailUrl: row.deletedAt ? null : row.thumbnailUrl,
    duration: row.duration,
    attachment: messageMetadata(row).attachment,
    deleted: Boolean(row.deletedAt),
  });
}

/** Fit real dimensions; no stretching/cropping or hard-coded landscape ratio
 * once metadata is available. The fallback is a loading reservation only. */
export function fitMedia(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const w = width > 0 && Number.isFinite(width) ? width : 4;
  const h = height > 0 && Number.isFinite(height) ? height : 3;
  const scale = Math.min(maxWidth / w, maxHeight / h);
  return { width: Math.max(1, w * scale), height: Math.max(1, h * scale) };
}

/** Only actual samples are resampled. Missing data gets a progress rail, never
 * a random/equalizer waveform. Accept normalized amplitudes or legacy 0..100. */
export function waveformPeaks(samples?: number[], count = 32): number[] | null {
  if (!samples?.length) return null;
  let maximum = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return null;
    maximum = Math.max(maximum, Math.abs(sample));
  }
  const scale = maximum <= 1 ? 1 : 100;
  const size = Math.min(count, samples.length);
  return Array.from({ length: size }, (_, index) => {
    const start = Math.floor((index * samples.length) / size);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * samples.length) / size),
    );
    let peak = 0;
    for (let cursor = start; cursor < end; cursor++)
      peak = Math.max(peak, Math.abs(samples[cursor]) / scale);
    return Math.min(1, peak);
  });
}
