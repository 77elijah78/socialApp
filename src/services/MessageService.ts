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

interface SendMeta {
  senderId: string;
  receiverId: string;
  conversationId: string;
}

interface ServerMessageResponse {
  id: string;
  createdAt: string;
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
      text: text.trim(),
      type: "text",
      mediaUrl: null,
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      roomId: meta.conversationId,
      status: "sending",
      direction: "sent",
      timestamp: Date.now(),
    };

    await messageStore.save(optimistic);

    try {
      const server = await api.post<ServerMessageResponse>(
        `/conversations/${encodeURIComponent(meta.conversationId)}/messages`,
        { content: text.trim(), receiverId: meta.receiverId },
        this.authToken ?? undefined,
      );

      const serverId = server.id;
      const serverTimestamp = new Date(server.createdAt).getTime();

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
    return this.send(msg.text ?? "", { ...meta, conversationId });
  }

  async sendMediaRecord(type: string, mediaUrl: string | null, meta: SendMeta) {
    const localId = uid();

    const optimistic: NewMessageRow = {
      localId,
      id: localId,
      text: null,
      type,
      mediaUrl,
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      roomId: meta.conversationId,
      status: "sending",
      direction: "sent",
      timestamp: Date.now(),
    };

    await messageStore.save(optimistic);

    try {
      const server = await api.post<ServerMessageResponse>(
        `/conversations/${encodeURIComponent(meta.conversationId)}/messages`,
        { content: "", mediaUrl, receiverId: meta.receiverId },
        this.authToken ?? undefined,
      );

      const serverId = server.id;
      const serverTimestamp = new Date(server.createdAt).getTime();

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
      `/conversations/${encodeURIComponent(conversationId)}/messages?page=${page}&limit=${limit}`,
      this.authToken ?? undefined,
    );

    const messages = Array.isArray(data) ? data : data.messages ?? data.data ?? [];

    const incoming: NewMessageRow[] = messages.map((m: any) => ({
      localId: m.id,
      id: m.id,
      text: m.content ?? null,
      type: m.type ?? "text",
      mediaUrl: m.mediaUrl ?? null,
      senderId: m.senderId,
      receiverId: m.receiverId ?? currentUserId,
      roomId: m.conversationId,
      direction: m.senderId === currentUserId ? "sent" : "received",
      status: m.status ?? (m.senderId === currentUserId ? "sent" : "delivered"),
      timestamp: m.timestamp ?? m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
    }));

    return messageStore.saveMany(incoming);
  }

  async delete(messageId: string) {
    await messageStore.deleteOne(messageId);

    await api.delete(
      `/conversations/messages/${encodeURIComponent(messageId)}`,
      this.authToken ?? undefined,
    );
  }

  async edit(messageId: string, newText: string) {
    this.validate(newText);

    await messageStore.editText(messageId, newText.trim());

    await api.patch(
      `/conversations/messages/${encodeURIComponent(messageId)}`,
      { text: newText.trim() },
      this.authToken ?? undefined,
    );
  }

  async markRoomAsRead(roomId: string) {
    return messageStore.markRoomAsRead(roomId, Date.now());
  }
}
