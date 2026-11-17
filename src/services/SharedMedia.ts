import * as FileSystem from "expo-file-system/legacy";
import type { SharedDraftFile } from "./ShareIntentInbox";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

export function safeSharedFileName(name: string, mimeType: string, index = 0) {
  const cleaned =
    (name || `shared-${index + 1}`)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 120) || `shared-${index + 1}`;
  if (/\.[a-z0-9]{1,8}$/i.test(cleaned)) return cleaned;
  const extension = EXTENSION_BY_MIME[mimeType] ?? "bin";
  return `${cleaned}.${extension}`;
}

/** Copies a provider/content URI immediately, while the temporary grant from
 * ACTION_SEND is alive, into app cache storage. The cached copy is what the
 * normal uploader sees; no new upload protocol is introduced. */
export async function stageSharedFile(
  file: SharedDraftFile,
  index: number,
): Promise<SharedDraftFile> {
  const root = FileSystem.cacheDirectory;
  if (!root) throw new Error("Sharing files requires the native app.");
  const directory = `${root}shared-intent/`;
  const name = safeSharedFileName(file.name, file.mimeType, index);
  // Intake already staged this grant; never duplicate a cache copy on send.
  if (file.uri.startsWith(directory)) {
    const existing = await FileSystem.getInfoAsync(file.uri);
    if (!existing.exists)
      throw new Error("The shared file is no longer available.");
    return { ...file, name, size: existing.size ?? file.size };
  }
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}-${index}-${name}`;
  await FileSystem.copyAsync({ from: file.uri, to: destination });
  const info = await FileSystem.getInfoAsync(destination);
  if (!info.exists) throw new Error("The shared file is no longer available.");
  return {
    ...file,
    uri: destination,
    name,
    size: info.size ?? file.size,
  };
}

/** Removes our cache copy once the upload has finished; the native provider's
 * original file is never touched. */
export async function discardStagedFile(uri: string) {
  if (!uri.includes("/shared-intent/")) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

export function sharedFileLabel(count: number) {
  return `${count} ${count === 1 ? "attachment" : "attachments"}`;
}
