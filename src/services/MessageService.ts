import { BaseUploader } from "./BaseUploader";
import { messageStore } from "../db/MessageStore";
import { syncStateStore } from "../db/syncStateStore";
import { roomStore } from "../db/RoomStore";
import type { MessageRow, NewMessageRow } from "../db/schema";
import {
  normalizeRemoteMessage,
  type RemoteMessage,
} from "../utils/messaging/serialization";
import { compareMessages } from "../utils/messaging/timeline";
import { roomAuthors } from "../utils/messaging/roomAuthors";
import { receiptQueue } from "../db/receiptQueue";
import { replyPreview } from "../utils/messaging/presentation";
import type {
  AttachmentInfo,
  MessageAuthorInfo,
} from "../utils/messaging/presentation";
import { api } from "./api";

interface SendMeta {
  senderId: string;
  receiverId: string | null;
  conversationId: string;
  sender?: MessageAuthorInfo;
}
interface ServerCursor {
  lastTimestamp: number;
  lastId: string;
}
interface SendResponse {
  data: { id: string; createdAt: string };
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class MessageService extends BaseUploader {
  private readonly activeSyncs = new Map<string, Promise<MessageRow[]>>();
  private readonly activeCatchups = new Map<string, Promise<void>>();
  private readonly activeSends = new Map<string, Promise<MessageRow | null>>();
  private session = 0;
  // Persisted outgoing timestamps stay immutable. Page cursors must instead
  // follow server ordering, including when the client clock differs.
  private readonly pageCursors = new WeakMap<MessageRow[], ServerCursor>();
  private readonly pageSizes = new WeakMap<MessageRow[], number>();

  resetSession() {
    this.session += 1;
    messageStore.resetOutgoing();
    this.activeSyncs.clear();
    this.activeCatchups.clear();
    this.activeSends.clear();
    this.clearAuthToken();
  }

  private validate(text: string) {
    if (!text.trim()) throw new Error("Message text cannot be empty.");
    if (text.length > 5000) throw new Error("Message exceeds 5000 characters.");
  }

  private optimistic(
    meta: SendMeta,
    patch: Partial<NewMessageRow>,
  ): NewMessageRow {
    const localId = uid();
    const { sender, ...identity } = meta;
    return {
      localId,
      id: localId,
      content: null,
      mediaUrl: null,
      thumbnailUrl: null,
      type: "TEXT",
      status: "SENDING",
      ...identity,
      senderData: sender ? JSON.stringify(sender) : null,
      replyData: null,
      attachmentData: null,
      isRead: false,
      timestamp: Date.now(),
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      duration: null,
      repliedToId: null,
      forwardedFromId: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      retryCount: 0,
      ...patch,
    };
  }

  private async create(meta: SendMeta, patch: Partial<NewMessageRow>) {
    if (!this.authToken) throw new Error("Sign in before sending a message.");
    const epoch = this.session;
    const release = messageStore.beginOutgoing(meta.senderId);
    try {
      if (patch.repliedToId) {
        const parent = (
          await messageStore.getByIds(meta.conversationId, [patch.repliedToId])
        )[0];
        if (parent)
          patch = {
            ...patch,
            replyData: JSON.stringify({
              ...replyPreview(parent),
              content: parent.deletedAt
                ? ""
                : (parent.content || "").slice(0, 180),
            }),
          };
      }
      const message = await messageStore.save(this.optimistic(meta, patch));
      if (epoch !== this.session) return null;
      return await this.transmit(message, epoch);
    } finally {
      release();
    }
  }

  private transmit(
    message: MessageRow,
    epoch: number,
  ): Promise<MessageRow | null> {
    const existing = this.activeSends.get(message.localId);
    if (existing) return existing;
    const request = this.performSend(message, epoch);
    this.activeSends.set(message.localId, request);
    void request
      .finally(() => {
        if (this.activeSends.get(message.localId) === request)
          this.activeSends.delete(message.localId);
      })
      .catch(() => {});
    return request;
  }

  private async performSend(
    message: MessageRow,
    epoch: number,
  ): Promise<MessageRow | null> {
    try {
      let mediaUrl = message.mediaUrl;
      let thumbnailUrl = message.thumbnailUrl;
      if (mediaUrl && !/^https?:\/\//i.test(mediaUrl)) {
        const uploaded = await this.uploadMedia({
          uri: mediaUrl,
          name: mediaUrl.split("/").pop() ?? `attachment-${message.localId}`,
          type:
            (
              {
                png: "image/png",
                webp: "image/webp",
                gif: "image/gif",
                heic: "image/heic",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                mov: "video/quicktime",
                mp4: message.type === "AUDIO" ? "audio/mp4" : "video/mp4",
                mp3: "audio/mpeg",
                m4a: "audio/mp4",
                wav: "audio/wav",
                pdf: "application/pdf",
              } as Record<string, string>
            )[mediaUrl.split(".").pop()?.toLowerCase() ?? ""] ??
            (message.type === "IMAGE"
              ? "image/jpeg"
              : message.type === "VIDEO"
                ? "video/mp4"
                : message.type === "AUDIO"
                  ? "audio/mp4"
                  : "application/octet-stream"),
        });
        mediaUrl = uploaded.url;
        thumbnailUrl = uploaded.thumbnailUrl ?? null;
        if (epoch !== this.session) return null;
        const localMetadata = message.attachmentData
          ? (JSON.parse(message.attachmentData) as AttachmentInfo)
          : {};
        await messageStore.patch(message.localId, {
          mediaUrl,
          thumbnailUrl,
          attachmentData: JSON.stringify({
            ...localMetadata,
            size: uploaded.size ?? localMetadata.size,
            width: uploaded.width ?? localMetadata.width,
            height: uploaded.height ?? localMetadata.height,
            mimeType: uploaded.mimeType ?? localMetadata.mimeType,
          }),
        });
      }
      if (epoch !== this.session) return null;
      const endpoint = message.repliedToId ? "reply" : "messages";
      const response = await api.post<SendResponse>(
        `/messages/conversations/${encodeURIComponent(message.conversationId)}/${endpoint}`,
        {
          content: message.content ?? "",
          ...(message.receiverId ? { receiverId: message.receiverId } : {}),
          type: message.type,
          ...(message.repliedToId ? { repliedToId: message.repliedToId } : {}),
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          ...(message.duration != null ? { duration: message.duration } : {}),
        },
        this.authToken ?? undefined,
      );
      if (epoch !== this.session) return null;
      return await messageStore.confirm(
        message.localId,
        response.data.id,
        Date.parse(response.data.createdAt),
      );
    } catch (error) {
      if (epoch === this.session)
        await messageStore.markFailed(message.localId);
      throw error;
    }
  }

  send(text: string, meta: SendMeta) {
    this.validate(text);
    return this.create(meta, { content: text.trim() });
  }
  replyMessage(text: string, meta: SendMeta, repliedToId: string) {
    this.validate(text);
    return this.create(meta, { content: text.trim(), repliedToId });
  }
  sendMediaRecord(
    type: string,
    mediaUrl: string | null,
    meta: SendMeta,
    duration?: number,
    repliedToId?: string,
    attachment?: AttachmentInfo,
  ) {
    if (!mediaUrl) throw new Error("Attachment URI is required.");
    const messageType =
      type.startsWith("image/") || type === "IMAGE"
        ? "IMAGE"
        : type.startsWith("video/") || type === "VIDEO"
          ? "VIDEO"
          : type.startsWith("audio/") || type === "AUDIO"
            ? "AUDIO"
            : "DOCUMENT";
    return this.create(meta, {
      type: messageType,
      mediaUrl,
      duration: duration ?? null,
      repliedToId: repliedToId ?? null,
      content:
        messageType === "DOCUMENT" || messageType === "AUDIO"
          ? (attachment?.name ?? null)
          : null,
      attachmentData: attachment ? JSON.stringify(attachment) : null,
    });
  }

  async retry(
    conversationId: string,
    localId: string,
    meta: Omit<SendMeta, "conversationId">,
  ) {
    const existing = this.activeSends.get(localId);
    if (existing) return existing;
    const row = await messageStore.getByLocalId(localId);
    if (
      !row ||
      row.conversationId !== conversationId ||
      row.senderId !== meta.senderId
    )
      throw new Error("Message not found in this conversation.");
    if (row.status !== "FAILED") return row;
    if (!this.authToken) throw new Error("Sign in before sending a message.");
    const epoch = this.session;
    const release = messageStore.beginOutgoing(meta.senderId);
    try {
      const retry = await messageStore.resetForRetry(localId);
      if (!retry || epoch !== this.session) return null;
      return await this.transmit(retry, epoch);
    } finally {
      release();
    }
  }

  async uploadMedia(
    file: { uri: string; name: string; type: string },
    onProgress?: (percent: number) => void,
  ): Promise<{
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    size?: number;
    mimeType?: string;
  }> {
    const formData = new FormData();
    formData.append("file", file as unknown as Blob);
    const response = (await this._uploadWithProgress(
      "/media/upload",
      formData,
      onProgress,
    )) as {
      data?: {
        url: string;
        thumbnailUrl?: string;
        width?: number;
        height?: number;
        size?: number;
        mimeType?: string;
      };
      url?: string;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
      size?: number;
      mimeType?: string;
    };
    const data = response.data ?? response;
    if (!data.url) throw new Error("Upload response did not include a URL.");
    return { ...data, url: data.url };
  }

  syncFromServer(
    conversationId: string,
    userId: string,
    cursor?: ServerCursor,
    limit = 30,
  ): Promise<MessageRow[]> {
    const key = `${userId}:${conversationId}:${cursor?.lastId ?? cursor?.lastTimestamp ?? "latest"}:${limit}`;
    const active = this.activeSyncs.get(key);
    if (active) return active;
    const epoch = this.session;
    const request = this.fetchFromServer(
      conversationId,
      userId,
      epoch,
      cursor,
      limit,
    );
    this.activeSyncs.set(key, request);
    void request
      .finally(() => {
        if (this.activeSyncs.get(key) === request) this.activeSyncs.delete(key);
      })
      .catch(() => {});
    return request;
  }

  private async fetchFromServer(
    conversationId: string,
    userId: string,
    epoch: number,
    cursor?: ServerCursor,
    limit = 30,
    page?: number,
  ) {
    const requestStartedAt = Date.now();
    const roomVersion = messageStore.getRoomVersion(conversationId);
    let url = `/messages/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`;
    if (page) url += `&page=${page}`;
    if (cursor?.lastId) url += `&cursorId=${encodeURIComponent(cursor.lastId)}`;
    else if (cursor?.lastTimestamp) url += `&before=${cursor.lastTimestamp}`;
    const response = await api.get<
      RemoteMessage[] | { messages?: RemoteMessage[]; data?: RemoteMessage[] }
    >(url, this.authToken ?? undefined);
    const remote = Array.isArray(response)
      ? response
      : (response.messages ?? response.data);
    if (!Array.isArray(remote))
      throw new Error("Invalid message history response.");
    const room = (await roomStore.findRoom(conversationId))[0];
    const isGroup = room?.isGroup === true;
    const authors = roomAuthors(room);
    const incoming = remote.map((message) =>
      normalizeRemoteMessage(message, userId, isGroup, authors),
    );
    if (incoming.some((row) => row.conversationId !== conversationId))
      throw new Error("History response contains another conversation.");
    // Own socket/history echoes wait for REST's identity mapping, not a timer or
    // fuzzy content match. Failed/ambiguous sends are never auto-replayed.
    await messageStore.waitForOutgoing(userId);
    if (
      epoch !== this.session ||
      roomVersion !== messageStore.getRoomVersion(conversationId)
    )
      return [];
    const rows = (await messageStore.saveMany(incoming, requestStartedAt)).sort(
      compareMessages,
    );
    this.pageSizes.set(rows, remote.length);
    // This backend echoes reads only to the sender. A fresh DM history response
    // with this recipient's committed READ is also authoritative confirmation.
    // Group-wide READ cannot confirm an individual member; never infer that.
    for (const row of incoming) {
      if (
        !isGroup &&
        row.receiverId === userId &&
        row.senderId !== userId &&
        row.isRead &&
        row.id
      )
        await receiptQueue.acknowledge("READ", row.id);
    }
    const oldest = incoming.reduce<NewMessageRow | undefined>(
      (previous, row) =>
        !previous || compareMessages(row, previous) < 0 ? row : previous,
      undefined,
    );
    if (oldest?.id)
      this.pageCursors.set(rows, {
        lastId: oldest.id,
        lastTimestamp: oldest.timestamp,
      });
    return rows;
  }

  /** Fetch only missing pages back to a persisted cached boundary. */
  syncLatest(
    conversationId: string,
    userId: string,
    _isCurrent?: () => boolean,
  ): Promise<void> {
    const key = `${userId}:${conversationId}`;
    const active = this.activeCatchups.get(key);
    if (active) return active;
    const work = this.catchUp(conversationId, userId, this.session);
    this.activeCatchups.set(key, work);
    void work
      .finally(() => {
        if (this.activeCatchups.get(key) === work)
          this.activeCatchups.delete(key);
      })
      .catch(() => {});
    return work;
  }

  private async catchUp(conversationId: string, userId: string, epoch: number) {
    const roomVersion = messageStore.getRoomVersion(conversationId);
    const isCurrent = () =>
      epoch === this.session &&
      roomVersion === messageStore.getRoomVersion(conversationId);
    const cached = await messageStore.getRecent(conversationId, 30);
    if (!isCurrent()) return;
    const known = cached
      .filter(
        (row) => row.id && row.status !== "SENDING" && row.status !== "FAILED",
      )
      .at(-1);
    const checkpoint = await syncStateStore.get(conversationId);
    if (!isCurrent()) return;
    const target =
      checkpoint ??
      (known?.id
        ? {
            conversationId,
            targetId: known.id,
            targetTimestamp: known.timestamp,
            beforeId: null,
            beforeTimestamp: null,
          }
        : null);
    // Persist BEFORE saving new latest rows, so a crash/network failure cannot
    // hide a gap behind the now-newer local cache.
    if (target) await syncStateStore.set(target);
    if (!isCurrent()) return;
    let page = await this.syncFromServer(conversationId, userId);
    const seen = new Set<string>();
    let canResume = Boolean(checkpoint?.beforeId);
    while (target && page.length && isCurrent()) {
      if (canResume && known && page.some((row) => row.id === known.id)) {
        canResume = false;
        try {
          const resumed = await this.syncFromServer(conversationId, userId, {
            lastId: checkpoint!.beforeId!,
            lastTimestamp: checkpoint!.beforeTimestamp!,
          });
          if (resumed.length) {
            page = resumed;
            continue;
          }
        } catch {
          if (!isCurrent()) return;
          // The saved cursor may have been remotely deleted. Walk from the
          // freshly fetched head instead; a real outage still fails below and
          // keeps the checkpoint, rather than declaring a sparse cache complete.
        }
      }
      const oldest = this.pageCursors.get(page) ?? {
        lastId: page[0].id!,
        lastTimestamp: page[0].timestamp,
      };
      // Timestamp equality cannot establish a boundary (several pages may have
      // the same timestamp); an outgoing local clock can differ too. Stop at
      // the actual target ID, or exhaustion if that target was remotely deleted.
      if (page.some((row) => row.id === target.targetId)) break;
      if (!oldest.lastId || seen.has(oldest.lastId))
        throw new Error("Server history cursor did not advance.");
      seen.add(oldest.lastId);
      await syncStateStore.set({
        ...target,
        beforeId: oldest.lastId,
        beforeTimestamp: oldest.lastTimestamp,
      });
      if (!isCurrent()) return;
      page = await this.syncFromServer(conversationId, userId, {
        lastId: oldest.lastId,
        lastTimestamp: oldest.lastTimestamp,
      });
    }
    if (isCurrent()) await syncStateStore.delete(conversationId);
  }

  /** Explicit, cancellable reply search on the existing page/limit API. Cache
   * first allows offline jumps. Fetching through the parent also discovers all
   * later direct replies without inventing a replies/around-message endpoint. */
  private async getReplyRange(conversationId: string, parent: MessageRow) {
    // Outgoing insertion timestamps are intentionally immutable. Clock skew
    // must not hide replies whose server timestamps precede that local key.
    const replies = await messageStore.getReplies(conversationId, [
      parent.localId,
      parent.id || parent.localId,
    ]);
    let earliest = parent;
    for (const reply of replies)
      if (compareMessages(reply, earliest) < 0) earliest = reply;
    return messageStore.getFromMessage(conversationId, earliest);
  }

  async loadReplyContext(
    conversationId: string,
    userId: string,
    targetId: string,
    isCurrent: () => boolean,
  ): Promise<{
    parent: MessageRow;
    rows: MessageRow[];
    complete: boolean;
    error: string | null;
  }> {
    const epoch = this.session;
    const version = messageStore.getRoomVersion(conversationId);
    const current = () =>
      isCurrent() &&
      epoch === this.session &&
      version === messageStore.getRoomVersion(conversationId);
    let parent = (await messageStore.getByIds(conversationId, [targetId]))[0];
    if (parent?.deletedAt) throw new Error("The original message was deleted.");
    let cached = parent ? await this.getReplyRange(conversationId, parent) : [];
    if (!current()) throw new Error("Reply navigation cancelled.");
    if (!this.authToken) {
      if (parent)
        return {
          parent,
          rows: cached,
          complete: false,
          error: "Showing cached replies. Connect to check for more.",
        };
      throw new Error(
        "The original message isn’t cached. Connect and try again.",
      );
    }
    const seen = new Set<string>();
    try {
      for (let page = 1; current(); page++) {
        const rows = await this.fetchFromServer(
          conversationId,
          userId,
          epoch,
          undefined,
          100,
          page,
        );
        if (!current()) throw new Error("Reply navigation cancelled.");
        const found = rows.find(
          (row) => row.id === targetId || row.localId === targetId,
        );
        if (found) {
          if (found.deletedAt)
            throw new Error("The original message was deleted.");
          parent = found;
          cached = await this.getReplyRange(conversationId, parent);
          return { parent, rows: cached, complete: true, error: null };
        }
        const advancing = rows.some((row) => !seen.has(row.id || row.localId));
        rows.forEach((row) => seen.add(row.id || row.localId));
        if (
          !rows.length ||
          !advancing ||
          (this.pageSizes.get(rows) ?? rows.length) < 100
        )
          break;
      }
      throw new Error(
        "The original message is no longer available in server history.",
      );
    } catch (error) {
      if (!current()) throw new Error("Reply navigation cancelled.");
      const latestParent = (
        await messageStore.getByIds(conversationId, [targetId])
      )[0];
      if (latestParent?.deletedAt)
        throw new Error("The original message was deleted.");
      if (parent)
        return {
          parent,
          rows: await this.getReplyRange(conversationId, parent),
          complete: false,
          error:
            error instanceof Error
              ? error.message
              : "Couldn’t check all replies. Try again.",
        };
      throw error;
    }
  }

  async delete(id: string, deleteFor: "me" | "everyone" = "me") {
    const epoch = this.session;
    const message = await messageStore.getById(id);
    if (!message) return;
    if (message.status === "SENDING")
      throw new Error(
        "Wait for sending to finish before deleting this message.",
      );
    // Unsynced drafts have no server resource to delete.
    if (message.status !== "FAILED" && message.status !== "SENDING") {
      await api.delete(
        `/messages/${encodeURIComponent(message.id ?? id)}?deleteFor=${deleteFor}`,
        this.authToken ?? undefined,
      );
    }
    if (epoch === this.session) await messageStore.deleteOne(id);
  }
  async edit(id: string, text: string) {
    const epoch = this.session;
    this.validate(text);
    const row = await messageStore.getById(id);
    await api.post(
      `/messages/${encodeURIComponent(row?.id ?? id)}/edit`,
      { content: text.trim() },
      this.authToken ?? undefined,
    );
    if (epoch === this.session) await messageStore.editText(id, text.trim());
  }
  async markRoomAsRead(conversationId: string) {
    const epoch = this.session;
    await api.post(
      `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
      {},
      this.authToken ?? undefined,
    );
    if (epoch === this.session)
      await messageStore.markRoomAsRead(conversationId);
  }
  async markDelivered(id: string, conversationId: string) {
    const epoch = this.session;
    await api.post(
      "/messages/delivered",
      { messageIds: [id] },
      this.authToken ?? undefined,
    );
    if (epoch === this.session)
      await messageStore.markDelivered(id, conversationId);
  }
  async deleteConversation(conversationId: string) {
    const epoch = this.session;
    await api.delete(
      `/messages/conversations/${encodeURIComponent(conversationId)}`,
      this.authToken ?? undefined,
    );
    if (epoch !== this.session) return;
    await messageStore.deleteRoom(conversationId);
    const rooms = await roomStore.findRoom(conversationId);
    for (const room of rooms) await roomStore.deleteOne(room.id);
  }
  sendSharedPost(
    data: {
      postId: string;
      content: string;
      authorName: string;
      authorAvatarUrl: string | null;
      imageUrl?: string | null;
    },
    meta: SendMeta,
  ) {
    return this.create(meta, {
      type: "SHARED_POST",
      content: JSON.stringify({
        sharedPostId: data.postId,
        content: data.content,
        authorName: data.authorName,
        authorAvatarUrl: data.authorAvatarUrl,
        imageUrl: data.imageUrl ?? null,
      }),
    });
  }
  sendSharedStory(
    data: {
      storyId: string;
      mediaUrl: string;
      mediaType: string;
      caption: string | null;
      authorName: string;
      authorAvatarUrl: string | null;
    },
    meta: SendMeta,
  ) {
    return this.create(meta, {
      type: "SHARED_STORY",
      content: JSON.stringify({
        sharedStoryId: data.storyId,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        caption: data.caption,
        authorName: data.authorName,
        authorAvatarUrl: data.authorAvatarUrl,
      }),
    });
  }
}
