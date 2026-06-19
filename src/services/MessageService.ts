import { BaseUploader } from "./BaseUploader";
import { messageStore } from "../db/MessageStore";
import { NewMessageRow } from "../db/schema";
import { SocketReceiver, socketReceiver } from "./SocketReceiver";
import { mediaService } from "./MediaService";

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface SendMeta {
  senderId: string;
  receiverId: string;
  roomId: string;
}

interface ServerMessageResponse {
  id?: string;
  messageId?: string;
  timestamp?: number;
}

/**
 * MessageService
 *
 * Sends messages to the Node.js backend and keeps SQLite in sync optimistically.
 *
 * Flow for send():
 *   1. Build optimistic row (status: "sending") → insert into SQLite immediately
 *   2. POST to server
 *   3a. Success → confirm() sets real server id + status "sent"
 *   3b. Failure → markFailed() so UI shows retry button
 */
export class MessageService extends BaseUploader {
  private readonly endpoint = "/messages";
  private readonly maxLength = 5000;

  constructor(baseUrl: string, authToken: any) {
    super(baseUrl, authToken);
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  private validate(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error("Message text cannot be empty.");
    }
    if (text.length > this.maxLength) {
      throw new Error(`Message exceeds ${this.maxLength} characters.`);
    }
  }

  // ─── Send text ────────────────────────────────────────────────────────────

  /**
   * Send a text message.
   * Saves optimistically to SQLite before the network request so the UI
   * updates instantly, then confirms or marks failed based on the response.
   */
  async send(text: string, meta: SendMeta) {
    this.validate(text);

    const localId = uid();

    const optimistic: NewMessageRow = {
      localId,
      id: localId, // temp — overwritten on confirm
      text: text.trim(),
      type: "text",
      mediaUrl: null,
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      roomId: meta.roomId,
      status: "sending",
      direction: "sent",
      timestamp: Date.now(),
    };

    // 1. Write to SQLite — UI sees it immediately
    await messageStore.save(optimistic);

    try {
      //const res = await fetch(`${this.baseUrl}${this.endpoint}`, {
      //  method: "POST",
      //  headers: {
      //    "Content-Type": "application/json",
      //    ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      //  },
      //  body: JSON.stringify({ text: text.trim(), ...meta }),
      //});
      //
      //if (!res.ok) throw new Error(`[${res.status}]`);
      //
      //const server: ServerMessageResponse = await res.json();
      //const serverId = server.id ?? server.messageId ?? localId;
      //
      //// 2. Confirm — sets real id + status "sent"
      //return messageStore.confirm(localId, serverId, server.timestamp);

      socketReceiver.connect("a76f1590-445e-4ebe-891e-1d568bedb59e", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhNzZmMTU5MC00NDVlLTRlYmUtODkxZS0xZDU2OGJlZGI1OWUiLCJlbWFpbCI6ImFsaWNlQGV4YW1wbGUuY29tIiwidXNlcm5hbWUiOiJhbGljZSIsImlhdCI6MTc4MTg4MDIzOCwiZXhwIjoxNzgxODgxMTM4fQ.a9XcQNH9uCEjaRRwFuq2tKorbxMQV53Eak35GNUTp80");
      socketReceiver.joinRoom(`48eb005f-9771-4278-aed9-06c6fdf53980`);
      socketReceiver.socket?.emit("message:send", {
        localId,
        content: text.trim(),
        type: "text",
        receiverId: "a76f1590-445e-4ebe-891e-1d568bedb59e",
        conversationId: "48eb005f-9771-4278-aed9-06c6fdf53980",
        timestamp: optimistic.timestamp,
      });
      socketReceiver.socket?.emit("message:notification")

      console.log("message  sent", localId);
    } catch (err) {
      console.log(err);
      await messageStore.markFailed(localId);
      throw err;
    }
  }

  // ─── Retry failed ─────────────────────────────────────────────────────────

  /**
   * Retry a message that previously failed.
   * Resets its status to "sending" then re-sends.
   */
  async retry(roomId: string, localId: string, meta: Omit<SendMeta, "roomId">) {
    const msg = await messageStore.getByLocalId(localId);
    if (!msg) throw new Error("Message not found in local store.");

    await messageStore.resetForRetry(localId);
    return this.send(msg.text ?? "", { ...meta, roomId });
  }

  // ─── Send media record ────────────────────────────────────────────────────

  /**
   * After AudioUploader / VideoUploader finishes uploading a file,
   * call this to save the media message locally and notify the server.
   *
   * @param type      "audio" | "video"
   * @param mediaUrl  CDN URL returned by the upload
   * @param meta      senderId, receiverId, roomId
   */
  async sendMediaRecord(
    type: "audio" | "video",
    mediaUrl: string,
    meta: SendMeta,
  ) {
    const localId = uid();

    const optimistic: NewMessageRow = {
      localId,
      id: localId,
      text: null,
      type,
      mediaUrl,
      senderId: meta.senderId,
      receiverId: meta.receiverId,
      roomId: meta.roomId,
      status: "sending",
      direction: "sent",
      timestamp: Date.now(),
    };

    await messageStore.save(optimistic);

    try {
      const res = await fetch(`${this.baseUrl}${this.endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        },
        body: JSON.stringify({ type, mediaUrl, ...meta }),
      });

      if (!res.ok) throw new Error(`[${res.status}]`);

      const server: ServerMessageResponse = await res.json();
      const serverId = server.id ?? server.messageId ?? localId;

      return messageStore.confirm(localId, serverId, server.timestamp);
    } catch (err) {
      await messageStore.markFailed(localId);
      throw err;
    }
  }

  // ─── Sync from server ─────────────────────────────────────────────────────

  /**
   * Fetch message history from the server and upsert into SQLite.
   * Call on room open to catch any messages received while offline.
   *
   * @param roomId
   * @param currentUserId   Needed to set direction correctly
   * @param page            For pagination
   * @param limit
   */
  async syncFromServer(
    roomId: string,
    currentUserId: string,
    page = 1,
    limit = 30,
  ) {
    const data = await this._get(
      `${this.endpoint}?roomId=${roomId}&page=${page}&limit=${limit}`,
    );

    const incoming: NewMessageRow[] = (data.messages ?? data).map((m: any) => ({
      localId: m.id,
      id: m.id,
      text: m.text ?? null,
      type: m.type ?? "text",
      mediaUrl: m.mediaUrl ?? null,
      senderId: m.senderId,
      receiverId: m.receiverId,
      roomId: m.roomId,
      direction: m.senderId === currentUserId ? "sent" : "received",
      status: m.status ?? (m.senderId === currentUserId ? "sent" : "delivered"),
      timestamp: m.timestamp ?? Date.now(),
    }));

    return messageStore.saveMany(incoming);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  /**
   * Delete a message locally and on the server.
   */
  async delete(roomId: string, messageId: string) {
    await messageStore.deleteOne(messageId);

    const res = await fetch(`${this.baseUrl}${this.endpoint}/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.authToken ?? ""}` },
    });
    if (!res.ok) throw new Error(`Delete failed [${res.status}]`);
    return res.json();
  }

  // ─── Edit ─────────────────────────────────────────────────────────────────

  /**
   * Edit a message locally and on the server.
   */
  async edit(roomId: string, messageId: string, newText: string) {
    this.validate(newText);

    await messageStore.editText(messageId, newText.trim());

    const res = await fetch(`${this.baseUrl}${this.endpoint}/${messageId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken ?? ""}`,
      },
      body: JSON.stringify({ text: newText.trim() }),
    });
    if (!res.ok) throw new Error(`Edit failed [${res.status}]`);
    return res.json();
  }

  // ─── Mark read ────────────────────────────────────────────────────────────

  /**
   * Mark all received messages in a room as read.
   * Call when the user opens a conversation.
   */
  async markRoomAsRead(roomId: string) {
    return messageStore.markRoomAsRead(roomId, Date.now());
  }
}
