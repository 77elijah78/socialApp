import type { AttachmentInfo } from "./messaging/presentation";

// Mirrors backend eb79c44 middlewares/upload.ts; containers are not a codec guarantee.
const MIMES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
};
const ALLOWED = new Set([...Object.values(MIMES), "audio/webm"]);
export function mediaFileForUpload(
  uri: string,
  metadata: AttachmentInfo = {},
  messageType?: string,
) {
  const name =
    metadata.name || uri.split(/[?#]/)[0].split("/").pop() || "attachment";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const type =
    metadata.mimeType ||
    (messageType === "AUDIO" && ext === "webm"
      ? "audio/webm"
      : messageType === "AUDIO" && ext === "mp4"
        ? "audio/mp4"
        : MIMES[ext]) ||
    "application/octet-stream";
  if (!ALLOWED.has(type))
    throw new Error(
      "This server does not support that attachment format. Choose JPEG, PNG, GIF, WebP, MP4, MOV, WebM, AVI or a supported audio file. Documents and HEIC require backend support.",
    );
  const maxSize = type.startsWith("image/")
    ? 10
    : type.startsWith("video/")
      ? 200
      : 20;
  if (metadata.size && metadata.size > maxSize * 1024 * 1024)
    throw new Error(
      `This attachment exceeds the server's ${maxSize} MB limit.`,
    );
  return { uri, name, type };
}
