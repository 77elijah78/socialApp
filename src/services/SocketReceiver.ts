import { io, Socket } from "socket.io-client";
import { messageStore } from "../db/MessageStore";
import { NewMessageRow } from "../db/schema";

type Listener = (data?: any) => void;

/**
 * SocketReceiver
 *
 * Manages the Socket.IO connection, persists every incoming event
 * directly to SQLite via MessageStore, and notifies React subscribers.
 *
 * Server events handled:
 *   message:new       — new text / audio / video message
 *   message:delivered — server confirmed delivery to recipient
 *   message:read      — recipient opened and read the message
 *   message:deleted   — sender or server deleted a message
 *   message:edited    — sender edited a message
 *   typing:start      — someone is typing in this room
 *   typing:stop       — someone stopped typing
 */
export class SocketReceiver {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  /**
   * Connect and authenticate. Call once after login.
   */
  connect(userId: string, authToken: string): void {
    if (this.socket?.connected) return;

    this.socket = io(this.baseUrl, {
      auth:                 { token: authToken },
      query:                { userId },
      transports:           ["websocket"],
      reconnection:         true,
      reconnectionAttempts: 10,
      reconnectionDelay:    1500,
    });

    this.bindCoreEvents(userId);
  }

  /**
   * Disconnect gracefully. Call on logout.
   */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.listeners.clear();
  }

  /**
   * Join a chat room. Call when the user opens a conversation.
   */
  joinRoom(roomId: string): void {
    this.socket?.emit("room:join", { roomId });
  }

  /**
   * Leave a chat room. Call when the user closes a conversation.
   */
  leaveRoom(roomId: string): void {
    this.socket?.emit("room:leave", { roomId });
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ─── Core socket events ───────────────────────────────────────────────────

  private bindCoreEvents(currentUserId: string): void {
    const s = this.socket!;

    s.on("connect", () => {
      this.emit("connect");
    });

    s.on("disconnect", (reason: string) => {
      this.emit("disconnect", reason);
    });

    s.on("connect_error", (err: Error) => {
      this.emit("error", err.message);
    });

    // ── New message ──────────────────────────────────────────────────────
    s.on("message:new", async (payload: any) => {
      const message = this.normalize(payload, currentUserId);

      // Persist to SQLite — upsert in case we already have it locally
      await messageStore.saveReceived(message);

      this.emit("message:new", message);
    });

    // ── Delivery receipt ─────────────────────────────────────────────────
    s.on("message:delivered", async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      await messageStore.markDelivered(messageId, roomId);
      this.emit("message:delivered", { messageId, roomId });
    });

    // ── Read receipt ─────────────────────────────────────────────────────
    s.on("message:read", async ({ messageId, roomId, timestamp }: { messageId: string; roomId: string; timestamp: number }) => {
      await messageStore.markRead(messageId, roomId);
      this.emit("message:read", { messageId, roomId, timestamp });
    });

    // ── Remote delete ────────────────────────────────────────────────────
    s.on("message:deleted", async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      await messageStore.deleteOne(messageId);
      this.emit("message:deleted", { messageId, roomId });
    });

    // ── Remote edit ──────────────────────────────────────────────────────
    s.on("message:edited", async ({ messageId, roomId, text }: { messageId: string; roomId: string; text: string }) => {
      await messageStore.editText(messageId, text);
      this.emit("message:edited", { messageId, roomId, text });
    });

    // ── Typing indicators ────────────────────────────────────────────────
    s.on("typing:start", ({ senderId, roomId }: { senderId: string; roomId: string }) => {
      this.emit("typing:start", { senderId, roomId });
    });

    s.on("typing:stop", ({ senderId, roomId }: { senderId: string; roomId: string }) => {
      this.emit("typing:stop", { senderId, roomId });
    });
  }

  // ─── Normalize payload → SQLite row shape ─────────────────────────────────

  private normalize(payload: any, currentUserId: string): NewMessageRow {
    const id = payload.id ?? payload.messageId;
    return {
      localId:    id,
      id,
      text:       payload.text       ?? null,
      type:       payload.type       ?? "text",
      mediaUrl:   payload.mediaUrl   ?? null,
      senderId:   payload.senderId,
      receiverId: payload.receiverId,
      roomId:     payload.roomId,
      status:     "delivered",
      direction:  payload.senderId === currentUserId ? "sent" : "received",
      timestamp:  payload.timestamp  ?? Date.now(),
    };
  }

  // ─── Typing helpers ───────────────────────────────────────────────────────

  emitTypingStart(roomId: string, senderId: string): void {
    this.socket?.emit("typing:start", { roomId, senderId });
  }

  emitTypingStop(roomId: string, senderId: string): void {
    this.socket?.emit("typing:stop", { roomId, senderId });
  }

  // ─── Pub / Sub ────────────────────────────────────────────────────────────

  /**
   * Subscribe to a socket event.
   * Returns an unsubscribe function — always call it in useEffect cleanup.
   */
  on(event: string, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}

export const socketReceiver = new SocketReceiver(
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"
);
