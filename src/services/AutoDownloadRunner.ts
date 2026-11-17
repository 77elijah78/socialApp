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
    if (!shouldAutoDownload({ settings, category, size, network })) return;

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

  reset() {
    this.attempted.clear();
    this.signature = "";
  }
}

export const autoDownloadRunner = new AutoDownloadRunner();
