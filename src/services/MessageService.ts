import { BaseUploader } from "./BaseUploader";
import { messageStore } from "../db/MessageStore";
import { NewMessageRow } from "../db/schema";
import { api } from "./api";

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusRank(status: string): number {
  const s = String(status ?? "").toUpperCase();
  if (s === "READ") return 3;
  if (s === "DELIVERED") return 2;
  return 1;
}

function newerStatus(localStatus: string, serverStatus: string): string {
  return statusRank(localStatus) >= statusRank(serverStatus) ? localStatus : serverStatus;
}

interface SendMeta {
  senderId: string;
  receiverId: string | null;
  conversationId: string;
}

export class MessageService extends BaseUploader {
  private readonly maxLength = 5000;

  private validate(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error("Message text cannot be empty.");
    }
    if (text.length > this.maxLength) {
      throw new Error(`Message exceeds ${this.maxLength} characters.`);
    }
  }

  async send(text: string, meta: SendMeta) {
    this.validate(text);

    const localId = uid();

    const optimistic: NewMessageRow = {
      localId,
      id: localId,
      content: text.trim(),
      mediaUrl: null,
      thumbnailUrl: null,
      type: "TEXT",
      status: "SENDING",
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      conversationId: meta.conversationId,
      isRead: false,
      timestamp: Date.now(),
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      duration: null,
      repliedToId: null,
      forwardedFromId: null,
    };

    await messageStore.save(optimistic);

    try {
      const resp = await api.post<{ data: { id: string; createdAt: string } }>(
        `/messages/conversations/${encodeURIComponent(meta.conversationId)}/messages`,
        { content: text.trim(), receiverId: meta.receiverId },
        this.authToken ?? undefined,
      );

      const serverId = resp.data.id;
      const serverTimestamp = new Date(resp.data.createdAt).getTime();

      return messageStore.confirm(localId, serverId, serverTimestamp);
    } catch (err) {
      console.log(err);
      await messageStore.markFailed(localId);
      throw err;
    }
  }

  async retry(conversationId: string, localId: string, meta: Omit<SendMeta, "conversationId">) {
    const msg = await messageStore.getByLocalId(localId);
    if (!msg) throw new Error("Message not found in local store.");

    await messageStore.resetForRetry(localId);
    return this.send(msg.content ?? "", { ...meta, conversationId });
  }

  async uploadMedia(file: { uri: string; name: string; type: string }, onProgress?: (pct: number) => void): Promise<{ url: string; thumbnailUrl?: string }> {
    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const resp = await this._uploadWithProgress("/media/upload", formData, onProgress) as any;
    const data = resp.data ?? resp;
    return { url: data.url, thumbnailUrl: data.thumbnailUrl };
  }

  async sendMediaRecord(type: string, mediaUrl: string | null, meta: SendMeta) {
    const localId = uid();

    const msgType = type === "image/jpeg" ? "IMAGE"
      : type === "video/mp4" ? "VIDEO"
      : type === "audio/mpeg" ? "AUDIO"
      : type.startsWith("image/") ? "IMAGE"
      : type.startsWith("video/") ? "VIDEO"
      : type.startsWith("audio/") ? "AUDIO"
      : "DOCUMENT";

    const optimistic: NewMessageRow = {
      localId,
      id: localId,
      content: null,
      mediaUrl: mediaUrl,
      thumbnailUrl: null,
      type: msgType,
      status: "SENDING",
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      conversationId: meta.conversationId,
      isRead: false,
      timestamp: Date.now(),
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      duration: null,
      repliedToId: null,
      forwardedFromId: null,
    };

    await messageStore.save(optimistic);

    try {
      const resp = await api.post<{ data: { id: string; createdAt: string } }>(
        `/messages/conversations/${encodeURIComponent(meta.conversationId)}/messages`,
        { content: "", mediaUrl, type: msgType, receiverId: meta.receiverId },
        this.authToken ?? undefined,
      );

      const serverId = resp.data.id;
      const serverTimestamp = new Date(resp.data.createdAt).getTime();

      return messageStore.confirm(localId, serverId, serverTimestamp);
    } catch (err) {
      await messageStore.markFailed(localId);
      throw err;
    }
  }

  async syncFromServer(
    conversationId: string,
    currentUserId: string,
    page = 1,
    limit = 30,
  ) {
    const data = await api.get<any>(
      `/messages/conversations/${encodeURIComponent(conversationId)}/messages?page=${page}&limit=${limit}`,
      this.authToken ?? undefined,
    );

    const messages = Array.isArray(data) ? data : data.messages ?? data.data ?? [];

    const existing = await messageStore.getByRoom(conversationId);
    const statusByKey = new Map<string, string>();
    for (const row of existing) {
      const key = String(row.id ?? row.localId ?? "");
      if (key) {
        statusByKey.set(key, String(row.status ?? "SENT").toUpperCase());
      }
    }

    const incoming: NewMessageRow[] = messages.map((m: any) => {
      const serverId = typeof m.id === 'string' ? m.id : String(m.id ?? '');
      const serverStatus = String(m.status ?? (m.senderId === currentUserId ? "SENT" : "DELIVERED")).toUpperCase();
      const localStatus = statusByKey.get(serverId);
      const finalStatus = localStatus ? newerStatus(localStatus, serverStatus) : serverStatus;

      return {
        localId: serverId,
        id: serverId,
        content: m.content ?? null,
        mediaUrl: m.mediaUrl ?? null,
        thumbnailUrl: m.thumbnailUrl ?? null,
        type: m.type ?? "TEXT",
        status: finalStatus,
        senderId: m.senderId,
        receiverId: m.receiverId ?? null,
        conversationId: m.conversationId,
        isRead: m.isRead ?? false,
        timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
        deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null,
        deletedBy: m.deletedBy ?? null,
        duration: m.duration ?? null,
        repliedToId: m.repliedToId ?? null,
        forwardedFromId: m.forwardedFromId ?? null,
      };
    });

    return messageStore.saveMany(incoming);
  }

  async delete(messageId: string, deleteFor: 'me' | 'everyone' = 'me') {
    await messageStore.deleteOne(messageId);
    await api.delete(
      `/messages/${encodeURIComponent(messageId)}?deleteFor=${deleteFor}`,
      this.authToken ?? undefined,
    );
  }

  async edit(messageId: string, newText: string) {
    this.validate(newText);
    await messageStore.editText(messageId, newText.trim());
    await api.post(
      `/messages/${encodeURIComponent(messageId)}/edit`,
      { content: newText.trim() },
      this.authToken ?? undefined,
    );
  }

  async markRoomAsRead(conversationId: string) {
    await messageStore.markRoomAsRead(conversationId, Date.now());

    try {
      await api.post(
        `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
        {},
        this.authToken ?? undefined,
      );
    } catch (err) {
      console.log(err);
    }
  }

  async markDelivered(messageId: string, conversationId: string) {
    await messageStore.markDelivered(messageId, conversationId);

    try {
      await api.post(
        `/messages/delivered`,
        { messageIds: [messageId] },
        this.authToken ?? undefined,
      );
    } catch (err) {
      console.log(err);
    }
  }

  async deleteConversation(conversationId: string) {
    await api.delete(
      `/messages/conversations/${encodeURIComponent(conversationId)}`,
      this.authToken ?? undefined,
    );
  }

  async replyMessage(text: string, meta: SendMeta, repliedToId: string) {
    this.validate(text);

    const localId = uid();

    const optimistic: NewMessageRow = {
      localId,
      id: localId,
      content: text.trim(),
      mediaUrl: null,
      thumbnailUrl: null,
      type: "TEXT",
      status: "SENDING",
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      conversationId: meta.conversationId,
      isRead: false,
      timestamp: Date.now(),
      editedAt: null,
      deletedAt: null,
      deletedBy: null,
      duration: null,
      repliedToId,
      forwardedFromId: null,
    };

    await messageStore.save(optimistic);

    try {
      const resp = await api.post<{ data: { id: string; createdAt: string } }>(
        `/messages/conversations/${encodeURIComponent(meta.conversationId)}/reply`,
        { content: text.trim(), repliedToId, receiverId: meta.receiverId },
        this.authToken ?? undefined,
      );

      const serverId = resp.data.id;
      const serverTimestamp = new Date(resp.data.createdAt).getTime();

      return messageStore.confirm(localId, serverId, serverTimestamp);
    } catch (err) {
      console.log(err);
      await messageStore.markFailed(localId);
      throw err;
    }
  }
}
