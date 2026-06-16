import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * MessageStore — persists all sent + received messages locally per room.
 *
 * Storage schema:
 *   Key:   "chat:messages:{roomId}"
 *   Value: JSON array of Message objects, newest last
 *
 * Message shape:
 * {
 *   id:         string,   // server messageId or local temp id
 *   text:       string,
 *   type:       "text" | "audio" | "video",
 *   mediaUrl:   string | null,
 *   senderId:   string,
 *   receiverId: string,
 *   roomId:     string,
 *   status:     "sending" | "sent" | "delivered" | "read" | "failed",
 *   direction:  "sent" | "received",
 *   timestamp:  number,   // Unix ms
 *   localId:    string,   // always stable, used for optimistic updates
 * }
 */
export class MessageStore {
  _key(roomId) {
    return `chat:messages:${roomId}`;
  }

  // ─── Read ───────────────────────────────────────────────────────────────

  /**
   * Load all messages for a room, sorted oldest → newest.
   * @param {string} roomId
   * @returns {Promise<Message[]>}
   */
  async getAll(roomId) {
    try {
      const raw = await AsyncStorage.getItem(this._key(roomId));
      if (!raw) return [];
      const msgs = JSON.parse(raw);
      return msgs.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
      return [];
    }
  }

  /**
   * Load the N most recent messages (for initial render).
   * @param {string} roomId
   * @param {number} limit
   */
  async getRecent(roomId, limit = 30) {
    const all = await this.getAll(roomId);
    return all.slice(-limit);
  }

  // ─── Write ──────────────────────────────────────────────────────────────

  /**
   * Persist a single message. Deduplicates by `id` and `localId`.
   * @param {Message} message
   */
  async save(message) {
    const msgs = await this.getAll(message.roomId);
    const idx = msgs.findIndex(
      (m) => m.id === message.id || m.localId === message.localId
    );
    if (idx !== -1) {
      msgs[idx] = { ...msgs[idx], ...message }; // merge / update
    } else {
      msgs.push(message);
    }
    await AsyncStorage.setItem(
      this._key(message.roomId),
      JSON.stringify(msgs)
    );
    return message;
  }

  /**
   * Save multiple messages at once (e.g., after fetching history from server).
   * Deduplicates against existing messages.
   * @param {string}    roomId
   * @param {Message[]} incoming
   */
  async saveMany(roomId, incoming) {
    const existing = await this.getAll(roomId);
    const map = new Map(existing.map((m) => [m.id, m]));
    for (const msg of incoming) {
      map.set(msg.id, { ...map.get(msg.id), ...msg });
    }
    const merged = Array.from(map.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
    await AsyncStorage.setItem(this._key(roomId), JSON.stringify(merged));
    return merged;
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  /**
   * Update a single field on a message (e.g., status, text after edit).
   * Matches by `localId` first, then `id`.
   * @param {string} roomId
   * @param {string} localId
   * @param {object} patch   - fields to merge
   */
  async update(roomId, localId, patch) {
    const msgs = await this.getAll(roomId);
    const idx = msgs.findIndex(
      (m) => m.localId === localId || m.id === localId
    );
    if (idx === -1) return null;
    msgs[idx] = { ...msgs[idx], ...patch };
    await AsyncStorage.setItem(this._key(roomId), JSON.stringify(msgs));
    return msgs[idx];
  }

  /**
   * Mark messages as read up to a given timestamp.
   * @param {string} roomId
   * @param {number} upToTimestamp
   */
  async markReadUntil(roomId, upToTimestamp) {
    const msgs = await this.getAll(roomId);
    const updated = msgs.map((m) =>
      m.direction === "received" && m.timestamp <= upToTimestamp
        ? { ...m, status: "read" }
        : m
    );
    await AsyncStorage.setItem(this._key(roomId), JSON.stringify(updated));
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  /**
   * Delete a single message by id or localId.
   * @param {string} roomId
   * @param {string} messageId
   */
  async remove(roomId, messageId) {
    const msgs = await this.getAll(roomId);
    const filtered = msgs.filter(
      (m) => m.id !== messageId && m.localId !== messageId
    );
    await AsyncStorage.setItem(this._key(roomId), JSON.stringify(filtered));
  }

  /**
   * Wipe all messages for a room (e.g., on logout or clear chat).
   * @param {string} roomId
   */
  async clearRoom(roomId) {
    await AsyncStorage.removeItem(this._key(roomId));
  }

  /**
   * Get all room IDs that have stored messages.
   * @returns {Promise<string[]>}
   */
  async getAllRoomIds() {
    const keys = await AsyncStorage.getAllKeys();
    return keys
      .filter((k) => k.startsWith("chat:messages:"))
      .map((k) => k.replace("chat:messages:", ""));
  }

  // ─── Unread count ────────────────────────────────────────────────────────

  /**
   * Count unread received messages in a room.
   * @param {string} roomId
   */
  async getUnreadCount(roomId) {
    const msgs = await this.getAll(roomId);
    return msgs.filter(
      (m) => m.direction === "received" && m.status !== "read"
    ).length;
  }
}

export const messageStore = new MessageStore();
