import { useSyncExternalStore } from "react";
import type { ShareIntent } from "expo-share-intent";
import { stageSharedFile } from "./SharedMedia";

export interface SharedDraftFile {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ShareIntentDraft {
  files: SharedDraftFile[];
  receivedAt: number;
}

type Listener = () => void;

const empty: ShareIntentDraft = { files: [], receivedAt: 0 };

class ShareIntentInbox {
  private draft = empty;
  private listeners = new Set<Listener>();

  getSnapshot = () => this.draft;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(next: ShareIntentDraft) {
    this.draft = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* the picker is the only consumer */
      }
    }
  }

  accept(intent: ShareIntent): boolean {
    const files = (intent.files ?? [])
      .filter((file) => Boolean(file.path))
      .map((file, index) => ({
        id: `${Date.now()}-${index}-${file.path}`,
        uri: file.path,
        name: file.fileName || `shared-${index + 1}`,
        mimeType: file.mimeType || "application/octet-stream",
        size: file.size ?? undefined,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
        duration: file.duration ?? undefined,
      }));
    if (!files.length) return false;
    this.publish({ files, receivedAt: Date.now() });
    return true;
  }

  /** Copies provider grants while the launching activity is still alive. The
   * screen can render immediately; the staged paths replace the temporary
   * content URIs as soon as each copy completes. */
  async stagePending() {
    const receivedAt = this.draft.receivedAt;
    if (!receivedAt || !this.draft.files.length) return;
    const staged = new Map<string, SharedDraftFile>();
    await Promise.all(
      this.draft.files.map(async (file, index) => {
        try {
          staged.set(file.id, await stageSharedFile(file, index));
        } catch {
          // Keep the original grant; send() surfaces a concrete error.
        }
      }),
    );
    if (this.draft.receivedAt !== receivedAt) return;
    // Preserve removals and successful sends that happened while copying.
    this.publish({
      ...this.draft,
      files: this.draft.files.map((file) => staged.get(file.id) ?? file),
    });
  }

  remove(id: string) {
    this.publish({
      ...this.draft,
      files: this.draft.files.filter((file) => file.id !== id),
    });
  }

  clear() {
    this.publish(empty);
  }
}

export const shareIntentInbox = new ShareIntentInbox();

export function useShareIntentDraft() {
  return useSyncExternalStore(
    shareIntentInbox.subscribe,
    shareIntentInbox.getSnapshot,
    shareIntentInbox.getSnapshot,
  );
}
