import { BaseUploader } from "./BaseUploader";
import { messageStore } from "./MessageStore";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * MessageService — sends messages to the Node.js backend and keeps
 * local storage (MessageStore) in sync optimistically.
 *
 * Flow for send():
 *   1. Build a local message with status "sending" → save to store immediately
 *   2. POST to server
 *   3a. Success → update local record with server id + status "sent"
 *   3b. Failure → update local status to "failed"
 */
export class MessageService extends BaseUploader {
  constructor(baseUrl, authToken = null) {
    super(baseUrl, authToken);
    this.endpoint = "/messages";
    this.maxLength = 5000;
  }

  _validate(text) {
    if (!text || text.trim().length === 0) {
      throw new Error("Message text cannot be empty.");
    }
    if (text.length > this.maxLength) {
      throw new Error(`Message exceeds ${this.maxLength} characters.`);
    }
  }

  // ─── Send ────────────────────────────────────────────────────────────────

  /**
   * Send a text message with optimistic local save.
   *
   * @param {string} text
   * @param {{ senderId, receiverId, roomId }} meta
   * @returns {Promise<Message>}
   */
  async send(text, meta) {
    this._validate(text);

    const localId = uid();
    const optimistic = {
      id:         localId,
      localId,
      text:       text.trim(),
      type:       "text",
      mediaUrl:   null,
      senderId:   meta.senderId,
      receiverId: meta.receiverId,
      roomId:     meta.roomId,
      status:     "sending",
      direction:  "sent",
      timestamp:  Date.now(),
    };

    // 1. Save optimistically so the UI shows instantly
    await messageStore.save(optimistic);

    try {
      const res = await fetch(`${this.baseUrl}${this.endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
        },
        body: JSON.stringify({ text: text.trim(), ...meta }),
      });

      if (!res.ok) throw new Error(`[${res.status}]`);
      const server = await res.json();

      // 2. Merge server id + confirmed status
      const confirmed = await messageStore.update(meta.roomId, localId, {
        id:        server.id ?? server.messageId,
        status:    "sent",
        timestamp: server.timestamp ?? Date.now(),
      });
      return confirmed;
    } catch (err) {
      await messageStore.update(meta.roomId, localId, { status: "failed" });
      throw err;
    }
  }

  /**
   * Retry a failed message.
   * @param {string} roomId
   * @param {string} localId
   * @param {object} meta  - { senderId, receiverId }
   */
  async retry(roomId, localId, meta) {
    const msgs = await messageStore.getAll(roomId);
    const msg = msgs.find((m) => m.localId === localId);
    if (!msg) throw new Error("Message not found in local store.");
    await messageStore.update(roomId, localId, { status: "sending" });
    return this.send(msg.text, { ...meta, roomId });
  }

  // ─── Media message record ────────────────────────────────────────────────

  /**
   * After a successful audio/video upload, save a media message locally
   * and notify the server. Called from AudioUploader / VideoUploader screens.
   *
   * @param {"audio"|"video"} type
   * @param {string}          mediaUrl  - CDN url returned by upload
   * @param {{ senderId, receiverId, roomId }} meta
   */
  async sendMediaRecord(type, mediaUrl, meta) {
    const localId = uid();
    const optimistic = {
      id:         localId,
      localId,
      text:       null,
      type,
      mediaUrl,
      senderId:   meta.senderId,
      receiverId: meta.receiverId,
      roomId:     meta.roomId,
      status:     "sending",
      direction:  "sent",
      timestamp:  Date.now(),
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
      const server = await res.json();
      return messageStore.update(meta.roomId, localId, {
        id:     server.id ?? server.messageId,
        status: "sent",
      });
    } catch (err) {
      await messageStore.update(meta.roomId, localId, { status: "failed" });
      throw err;
    }
  }

  // ─── Fetch & sync from server ─────────────────────────────────────────────

  /**
   * Fetch message history from server and merge into local store.
   * Call on first room open to catch messages received while offline.
   *
   * @param {string} roomId
   * @param {string} currentUserId
   * @param {number} page
   * @param {number} limit
   * @returns {Promise<Message[]>}
   */
  async syncFromServer(roomId, currentUserId, page = 1, limit = 30) {
    const data = await this._get(
      `${this.endpoint}?roomId=${roomId}&page=${page}&limit=${limit}`
    );
    const incoming = (data.messages ?? data).map((m) => ({
      ...m,
      localId:   m.id,
      direction: m.senderId === currentUserId ? "sent" : "received",
      status:    m.status ?? (m.senderId === currentUserId ? "sent" : "delivered"),
    }));
    return messageStore.saveMany(roomId, incoming);
  }

  // ─── Delete / Edit ────────────────────────────────────────────────────────

  /**
   * Delete a message locally and on the server.
   * @param {string} roomId
   * @param {string} messageId
   */
  async delete(roomId, messageId) {
    await messageStore.remove(roomId, messageId);
    const res = await fetch(`${this.baseUrl}${this.endpoint}/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!res.ok) throw new Error(`Delete failed [${res.status}]`);
    return res.json();
  }

  /**
   * Edit a message locally and on the server.
   * @param {string} roomId
   * @param {string} messageId
   * @param {string} newText
   */
  async edit(roomId, messageId, newText) {
    this._validate(newText);
    await messageStore.update(roomId, messageId, { text: newText.trim() });
    const res = await fetch(`${this.baseUrl}${this.endpoint}/${messageId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({ text: newText.trim() }),
    });
    if (!res.ok) throw new Error(`Edit failed [${res.status}]`);
    return res.json();
  }

  /**
   * Mark all received messages in a room as read.
   * @param {string} roomId
   */
  async markRoomAsRead(roomId) {
    await messageStore.markReadUntil(roomId, Date.now());
  }
}
