import type { MessageRow } from "@/db/schema";
import { documentDownloads, documentKey } from "./DocumentDownloads";
import {
  AUTO_DOWNLOAD_SIZE_LIMITS,
  shouldAutoDownload,
  type AutoDownloadSettings,
  type NetworkCharge,
} from "./AutoDownloadSettings";
import {
  categoryForMessage,
  chatMediaSpecForMessage,
  mediaNameForMessage,
} from "./ChatMediaDownloads";

function attachmentSize(row: MessageRow): number | undefined {
  if (!row.attachmentData) return undefined;
  try {
    const parsed = JSON.parse(row.attachmentData) as { size?: unknown };
    return typeof parsed.size === "number" && parsed.size >= 0
      ? parsed.size
      : undefined;
  } catch {
    return undefined;
  }
}

class AutoDownloadRunner {
  private attempted = new Set<string>();
  private deferred = new Map<string, { row: MessageRow; ownerId: string }>();
  private signature = "";

  /** Called when network or settings change so a previously skipped transfer
   * can be reconsidered without re-downloading completed/failed files in a
   * loop. */
  sync(signature: string) {
    if (signature === this.signature) return;
    this.signature = signature;
    this.attempted.clear();
  }

  consider(
    row: MessageRow,
    ownerId: string,
    settings: AutoDownloadSettings,
    network: NetworkCharge,
  ) {
    if (!ownerId || row.senderId === ownerId || row.deletedAt) return;
    if (!row.mediaUrl || row.status === "SENDING") return;
    const category = categoryForMessage(row);
    if (!category) return;
    const size = attachmentSize(row);
    const deferredKey = `${row.conversationId}:${row.localId}`;
    if (!shouldAutoDownload({ settings, category, size, network })) {
      // Remember why this row was skipped so a later connection/settings
      // change can download it even if its upsert already scrolled away.
      if (this.deferred.size >= 80)
        this.deferred.delete(this.deferred.keys().next().value!);
      this.deferred.set(deferredKey, { row, ownerId });
      return;
    }
    this.deferred.delete(deferredKey);

    const meta = mediaNameForMessage(row);
    const input = chatMediaSpecForMessage(ownerId, row, meta.mimeType);
    if (!input) return;
    const name = meta.name || input.name || `attachment.${category}`;
    const key = documentKey({ ...input, name });
    if (this.attempted.has(key)) return;
    this.attempted.add(key);
    void documentDownloads.download({
      ...input,
      name,
      maxBytes: AUTO_DOWNLOAD_SIZE_LIMITS[category],
    });
  }

  considerAll(
    rows: MessageRow[],
    ownerId: string,
    settings: AutoDownloadSettings,
    network: NetworkCharge,
  ) {
    for (const row of rows) this.consider(row, ownerId, settings, network);
  }

  /** Reconsider rows skipped while offline or while their type was disabled. */
  retryDeferred(settings: AutoDownloadSettings, network: NetworkCharge) {
    const pending = [...this.deferred.values()];
    this.deferred.clear();
    for (const item of pending)
      this.consider(item.row, item.ownerId, settings, network);
  }

  reset() {
    this.attempted.clear();
    this.deferred.clear();
    this.signature = "";
  }
}

export const autoDownloadRunner = new AutoDownloadRunner();
