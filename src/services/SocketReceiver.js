import { io } from "socket.io-client";
import { messageStore } from "./MessageStore";

/**
 * SocketReceiver — manages the Socket.IO connection, receives incoming
 * messages (text / audio / video), saves them locally, and notifies listeners.
 *
 * Events emitted from the Node.js server that we handle:
 *   "message:new"       — new text/media message received
 *   "message:delivered" — server confirms delivery to recipient
 *   "message:read"      — recipient read a message
 *   "message:deleted"   — sender deleted a message
 *   "message:edited"    — sender edited a message
 *   "typing:start"      — someone is typing
 *   "typing:stop"       — someone stopped typing
 */
export class SocketReceiver {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.socket = null;
    this._listeners = new Map(); // eventName → Set of callbacks
  }

  // ─── Connection ──────────────────────────────────────────────────────────

  /**
   * Connect and authenticate. Call after login.
   * @param {string} userId
   * @param {string} authToken
   */
  connect(userId, authToken) {
    if (this.socket?.connected) return;

    this.socket = io(this.baseUrl, {
      auth: { token: authToken },
      query: { userId },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    this._bindCoreEvents(userId);
  }

  /**
   * Disconnect gracefully.
   */
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this._listeners.clear();
  }

  /**
   * Join a chat room (call when opening a conversation).
   * @param {string} roomId
   */
  joinRoom(roomId) {
    this.socket?.emit("room:join", { roomId });
  }

  /**
   * Leave a chat room (call when closing a conversation).
   * @param {string} roomId
   */
  leaveRoom(roomId) {
    this.socket?.emit("room:leave", { roomId });
  }

  // ─── Core socket events ──────────────────────────────────────────────────

  _bindCoreEvents(currentUserId) {
    const s = this.socket;

    s.on("connect", () => {
      this._emit("connect");
    });

    s.on("disconnect", (reason) => {
      this._emit("disconnect", reason);
    });

    s.on("connect_error", (err) => {
      this._emit("error", err.message);
    });

    // ── Incoming new message ───────────────────────────────────────────────
    s.on("message:new", async (payload) => {
      const message = this._normalize(payload, currentUserId);
      await messageStore.save(message);
      this._emit("message:new", message);
    });

    // ── Delivery receipt ───────────────────────────────────────────────────
    s.on("message:delivered", async ({ messageId, roomId }) => {
      await messageStore.update(roomId, messageId, { status: "delivered" });
      this._emit("message:delivered", { messageId, roomId });
    });

    // ── Read receipt ───────────────────────────────────────────────────────
    s.on("message:read", async ({ messageId, roomId, timestamp }) => {
      await messageStore.update(roomId, messageId, { status: "read" });
      this._emit("message:read", { messageId, roomId, timestamp });
    });

    // ── Remote delete ──────────────────────────────────────────────────────
    s.on("message:deleted", async ({ messageId, roomId }) => {
      await messageStore.remove(roomId, messageId);
      this._emit("message:deleted", { messageId, roomId });
    });

    // ── Remote edit ────────────────────────────────────────────────────────
    s.on("message:edited", async ({ messageId, roomId, text }) => {
      await messageStore.update(roomId, messageId, { text });
      this._emit("message:edited", { messageId, roomId, text });
    });

    // ── Typing indicators ──────────────────────────────────────────────────
    s.on("typing:start", ({ senderId, roomId }) => {
      this._emit("typing:start", { senderId, roomId });
    });
    s.on("typing:stop", ({ senderId, roomId }) => {
      this._emit("typing:stop", { senderId, roomId });
    });
  }

  // ─── Normalize payload → Message shape ───────────────────────────────────

  _normalize(payload, currentUserId) {
    return {
      id:         payload.id ?? payload.messageId,
      localId:    payload.id ?? payload.messageId,
      text:       payload.text ?? null,
      type:       payload.type ?? "text",
      mediaUrl:   payload.mediaUrl ?? null,
      senderId:   payload.senderId,
      receiverId: payload.receiverId,
      roomId:     payload.roomId,
      status:     "delivered",
      direction:  payload.senderId === currentUserId ? "sent" : "received",
      timestamp:  payload.timestamp ?? Date.now(),
    };
  }

  // ─── Typing emit helpers ─────────────────────────────────────────────────

  /**
   * Tell the server the current user started typing.
   * @param {string} roomId
   * @param {string} senderId
   */
  emitTypingStart(roomId, senderId) {
    this.socket?.emit("typing:start", { roomId, senderId });
  }

  /**
   * Tell the server the current user stopped typing.
   * @param {string} roomId
   * @param {string} senderId
   */
  emitTypingStop(roomId, senderId) {
    this.socket?.emit("typing:stop", { roomId, senderId });
  }

  // ─── Pub/Sub ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to a socket event.
   * @param {string}   event
   * @param {function} cb
   * @returns {function} unsubscribe
   */
  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this._listeners.get(event)?.delete(cb);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach((cb) => cb(data));
  }

  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

export const socketReceiver = new SocketReceiver(
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"
);
