import { io, Socket } from "socket.io-client";
import { messageStore } from "../db/MessageStore";
import { NewMessageRow } from "../db/schema";
import { roomStore } from "@/db/RoomStore";

type Listener = (data?: any) => void;

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class SocketReceiver {
  public socket: Socket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private readonly baseUrl: string;
  private currentUserId: string = "";

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  connect(userId: string, authToken: string): void {
    if (this.socket?.connected) return;

    this.currentUserId = userId;

    this.socket = io(this.baseUrl, {
      auth: {
        token: authToken,
      },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    this.bindCoreEvents(userId);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.listeners.clear();
  }

  joinRoom(conversationId: string): void {
    this.socket?.emit("conversation:join", conversationId);
  }

  leaveRoom(conversationId: string): void {
    this.socket?.emit("conversation:leave", conversationId);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  private bindCoreEvents(currentUserId: string): void {
    const s = this.socket!;
    this.currentUserId = currentUserId;

    s.on("connect", () => {
      this.emit("connect");
    });

    s.on("disconnect", (reason: string) => {
      this.emit("disconnect", reason);
    });

    s.on("connect_error", (err: Error) => {
      this.emit("error", err.message);
    });

    // ── New message via WebSocket ──
    s.on("message:new", async (payload: any) => {
      const message = this.normalize(payload, currentUserId);
      await messageStore.saveReceived(message);
      this.emit("message:new", message);
    });

    // ── Push notification when not in the chat room ──
    s.on("message:notification", async (payload: any) => {
      if (!roomStore.findRoom(payload.conversationId)) {
        const localId = uid();
        const room = {
          id: localId,
          name: payload.sender?.username ?? payload.senderUsername ?? "Unknown",
          conversationId: payload.conversationId,
          avatarUrl: payload.sender?.avatarUrl ?? payload.avatarUrl ?? "",
          lastMessage: payload.content ?? "",
          lastMessageTimestamp: Date.now(),
          lastMessageType: payload.type ?? "TEXT",
          unreadCount: 1,
          receiverId: payload.senderId,
        };
        await roomStore.addRoom(room);
      }
      const message = this.normalize(payload, currentUserId);
      await messageStore.saveReceived(message);
      this.emit("message:notification", message);
    });

    // ── Delivery receipt ──
    s.on("message:delivered", async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      await messageStore.markDelivered(messageId, conversationId);
      this.emit("message:delivered", { messageId, conversationId });
    });

    // ── Read receipt ──
    s.on("message:read", async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (userId !== currentUserId) {
        await messageStore.markRoomAsRead(conversationId, Date.now());
      }
      this.emit("message:read", { conversationId, userId });
    });

    // ── Remote delete (everywhere) ──
    s.on("message:deleted", async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      await messageStore.deleteOne(messageId);
      this.emit("message:deleted", { messageId, conversationId });
    });

    // ── Delete for me only ──
    s.on("message:deleted-for-me", async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      await messageStore.deleteOne(messageId);
      this.emit("message:deleted-for-me", { messageId, conversationId });
    });

    // ── Remote edit ──
    s.on("message:edited", async ({ messageId, conversationId, content }: { messageId: string; conversationId: string; content: string }) => {
      await messageStore.editText(messageId, content);
      this.emit("message:edited", { messageId, conversationId, content });
    });

    // ── Typing indicators ──
    // Backend emits a single "message:typing" event with isTyping boolean.
    // We translate it to internal "typing:start" / "typing:stop" events.
    s.on("message:typing", ({ userId, conversationId, isTyping }: { userId: string; conversationId: string; isTyping: boolean }) => {
      if (isTyping) {
        this.emit("typing:start", { userId, conversationId });
      } else {
        this.emit("typing:stop", { userId, conversationId });
      }
    });

    // ── Presence ──
    s.on("presence:online", ({ userId, username }: { userId: string; username: string }) => {
      this.emit("presence:online", { userId, username });
    });

    s.on("presence:offline", ({ userId, lastSeen }: { userId: string; lastSeen: string }) => {
      this.emit("presence:offline", { userId, lastSeen });
    });

    // Auto-join personal room for push notifications
    s.emit("presence:join-personal");
  }

  // ─── Normalize payload → SQLite row shape ──

  private normalize(payload: any, currentUserId: string): NewMessageRow {
    const senderId = payload.senderId ?? payload.sender?.id;
    const content = payload.content ?? payload.text ?? null;
    const type = payload.type ?? "TEXT";
    const mediaUrl = payload.mediaUrl ?? null;
    const thumbnailUrl = payload.thumbnailUrl ?? null;
    const createdAt = payload.createdAt ?? payload.timestamp ?? Date.now();
    const timestamp = typeof createdAt === "number" ? createdAt : new Date(createdAt).getTime();

    return {
      localId: payload.id ?? `${senderId}-${timestamp}`,
      id: payload.id ?? `${senderId}-${timestamp}`,
      content,
      mediaUrl,
      thumbnailUrl,
      type,
      status: senderId === currentUserId ? "SENT" : "DELIVERED",
      senderId,
      receiverId: senderId === currentUserId ? payload.receiverId ?? null : currentUserId,
      conversationId: payload.conversationId,
      isRead: senderId !== currentUserId ? false : true,
      timestamp,
      editedAt: payload.editedAt ?? null,
      deletedAt: payload.deletedAt ?? null,
      deletedBy: payload.deletedBy ?? null,
      duration: payload.duration ?? null,
      repliedToId: payload.repliedToId ?? null,
      forwardedFromId: payload.forwardedFromId ?? null,
    };
  }

  emitTypingStart(conversationId: string, senderId: string): void {
    this.socket?.emit("message:typing", { conversationId, isTyping: true });
  }

  emitTypingStop(conversationId: string, senderId: string): void {
    this.socket?.emit("message:typing", { conversationId, isTyping: false });
  }

  on(event: string, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}

const SOCKET_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.3:3000";

export const socketReceiver = new SocketReceiver(SOCKET_BASE_URL);
