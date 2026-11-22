import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { MessageRow } from "@/db/schema";
import { displayMediaUrl, isDeviceFileUri } from "@/utils/mediaUrls";
import {
  documentDownloads,
  documentKey,
  type DocumentDownloadState,
  type DocumentSpec,
} from "./DocumentDownloads";
import {
  categoryForMedia,
  type AutoDownloadCategory,
} from "./AutoDownloadSettings";

export interface ChatMediaSpecInput {
  ownerId: string;
  id: string;
  uri: string;
  name?: string;
  mimeType?: string | null;
  localSource?: boolean;
}

export interface ChatMediaIdentity {
  kind: "photo" | "video" | "voice" | "music" | "document";
  category: AutoDownloadCategory;
  spec: DocumentSpec;
}

function extensionFor(mimeType?: string | null, fallback = "bin"): string {
  if (!mimeType) return fallback;
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return known[mimeType.toLowerCase()] ?? fallback;
}

function fileNameFromUri(uri: string): string | null {
  try {
    const path = new URL(uri).pathname;
    const name = path.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

export function chatMediaSpec(input: ChatMediaSpecInput): DocumentSpec {
  const fallbackName =
    fileNameFromUri(input.uri) ??
    `attachment.${extensionFor(input.mimeType)}`;
  return {
    ownerId: input.ownerId,
    id: input.id,
    uri: input.uri,
    name: input.name || fallbackName,
    localSource: input.localSource,
  };
}

export function chatMediaSpecForMessage(
  ownerId: string,
  row: MessageRow,
  mimeType?: string | null,
): ChatMediaSpecInput | null {
  const uri = displayMediaUrl(row.mediaUrl, false);
  if (!uri || row.deletedAt) return null;
  return {
    ownerId,
    id: row.localId,
    uri,
    name: row.content ?? undefined,
    mimeType,
    localSource: row.status === "SENDING" || isDeviceFileUri(uri),
  };
}

export function mediaKindForMessage(
  row: Pick<MessageRow, "type" | "content" | "attachmentData">,
): ChatMediaIdentity["kind"] | null {
  const type = row.type.toUpperCase();
  if (type === "IMAGE") return "photo";
  if (type === "VIDEO") return "video";
  if (type === "DOCUMENT") return "document";
  if (type === "AUDIO")
    return row.attachmentData || row.content ? "music" : "voice";
  return null;
}

export function categoryForMessage(row: MessageRow): AutoDownloadCategory | null {
  const kind = mediaKindForMessage(row);
  if (!kind) return null;
  const parsed = row.attachmentData
    ? (() => {
        try {
          return JSON.parse(row.attachmentData) as {
            name?: string;
            mimeType?: string;
          };
        } catch {
          return null;
        }
      })()
    : null;
  return categoryForMedia({
    type: row.type,
    mimeType: parsed?.mimeType,
    fileName: parsed?.name,
  });
}

export function mediaNameForMessage(row: MessageRow, mimeType?: string | null) {
  const parsed = row.attachmentData
    ? (() => {
        try {
          return JSON.parse(row.attachmentData) as {
            name?: string;
            mimeType?: string;
          };
        } catch {
          return null;
        }
      })()
    : null;
  return {
    name: parsed?.name ?? undefined,
    mimeType: parsed?.mimeType ?? mimeType ?? null,
  };
}

export function isLocalMedia(uri: string) {
  return isDeviceFileUri(uri);
}

/**
 * One manager backs every chat attachment. `DocumentDownloads` already owns
 * single-flight transfers, auth refresh, progress and an existence check that
 * survives JS restarts, so photos/videos/audio reuse it instead of creating a
 * second download cache or a different progress contract.
 */
export function useChatMediaDownload(spec: DocumentSpec | null) {
  const key = spec ? documentKey(spec) : "";
  const subscribe = useCallback(
    (listener: () => void) =>
      spec ? documentDownloads.subscribe(key, listener) : () => {},
    [key, spec],
  );
  const snapshot = useCallback(
    () => (spec ? documentDownloads.get(key) : { status: "idle" as const, bytes: 0 }),
    [key, spec],
  );
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    if (spec) void documentDownloads.inspect(spec);
  }, [spec]);

  const localAlreadyOwned = Boolean(
    spec?.localSource && spec.uri && isLocalMedia(spec.uri),
  );
  const ready =
    localAlreadyOwned ||
    (state.status === "ready" && Boolean(state.localUri));
  const download = useCallback(async () => {
    if (!spec) return undefined;
    await documentDownloads.download(spec);
    return documentDownloads.get(documentKey(spec)).localUri;
  }, [spec]);

  return useMemo(() => {
    const merged: DocumentDownloadState = localAlreadyOwned
      ? {
          status: "ready",
          bytes: state.bytes,
          total: state.total,
          localUri: spec?.uri,
        }
      : state;
    return {
      state: merged,
      ready,
      localUri: merged.localUri,
      busy: state.status === "queued" || state.status === "downloading",
      percent: state.total
        ? Math.min(100, Math.floor((state.bytes / state.total) * 100))
        : null,
      download,
    };
  }, [
    localAlreadyOwned,
    spec,
    ready,
    state,
    download,
  ]);
}
