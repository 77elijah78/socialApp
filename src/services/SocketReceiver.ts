import { io, type Socket } from "socket.io-client";
import { messageStore } from "../db/MessageStore";
import { roomStore } from "../db/RoomStore";
import { receiptQueue } from "../db/receiptQueue";
import {
  normalizeRemoteMessage,
  type RemoteMessage,
} from "../utils/messaging/serialization";
import { api } from "./api";

type Listener = (data?: any) => void;
export class SocketReceiver {
  public socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private currentUserId = "";
  private authToken = "";
  private generation = 0;
  private pendingSync: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private previousUserId = "";
  private roomReferences = new Map<string, number>();

  constructor(private readonly baseUrl: string) {}

  connect(userId: string, token: string): void {
    this.disconnect();
    if (this.previousUserId && this.previousUserId !== userId)
      this.roomReferences.clear();
    this.previousUserId = userId;
    this.currentUserId = userId;
    this.authToken = token;
    const generation = this.generation;
    const socket = io(this.baseUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;
    const current = () =>
      this.generation === generation && this.socket === socket;
    const safe = (work: () => Promise<unknown>) => {
      void work().catch((error) => {
        if (current()) this.emit("sync:error", error);
        if (__DEV__)
          console.warn("[SocketReceiver] persistence/sync failed", error);
      });
    };
    socket.on("connect", () => {
      if (!current()) return;
      socket.emit("presence:join-personal");
      for (const room of this.roomReferences.keys())
        socket.emit("conversation:join", room);
      this.emit("connect");
      safe(() => this.syncPendingDelivery());
      safe(() => this.flushReceipts());
    });
    socket.on("disconnect", (reason) => {
      if (current()) this.emit("disconnect", reason);
    });
    socket.on("connect_error", (error) => {
      if (current()) this.emit("error", error.message);
    });

    const receive = async (payload: RemoteMessage, notification: boolean) => {
      if (!current()) return;
      const roomVersion = messageStore.getRoomVersion(payload.conversationId);
      const stillCurrent = () =>
        current() &&
        roomVersion === messageStore.getRoomVersion(payload.conversationId);
      const incoming = normalizeRemoteMessage(payload, userId);
      const row = await messageStore.saveReceived(
        incoming,
        stillCurrent,
        userId,
      );
      if (!row || !stillCurrent()) return;
      if (row.senderId !== userId) {
        await receiptQueue.enqueue("DELIVERED", row.conversationId, [row.id!]);
        safe(() => this.flushReceipts());
      }
      if (notification) {
        const existing = (await roomStore.findRoom(row.conversationId))[0];
        if (!stillCurrent()) return;
        const unreadCount =
          existing?.unreadCount ??
          (await messageStore.getUnreadCount(row.conversationId, userId));
        if (!stillCurrent()) return;
        if (!existing) {
          await roomStore.upsertRoom({
            id: row.conversationId,
            conversationId: row.conversationId,
            name: payload.sender?.username ?? "Unknown",
            avatarUrl: payload.sender?.avatarUrl ?? "",
            receiverId: row.senderId === userId ? row.receiverId : row.senderId,
            lastMessage: row.content ?? "",
            lastMessageType: row.type,
            lastMessageTimestamp: row.timestamp,
            lastMessageStatus: row.status,
            unreadCount,
            cachedAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          await roomStore.updateRoom(row.conversationId, {
            unreadCount,
            ...(row.timestamp >= existing.lastMessageTimestamp
              ? {
                  lastMessage: row.content ?? "",
                  lastMessageType: row.type,
                  lastMessageTimestamp: row.timestamp,
                  lastMessageStatus: row.status,
                }
              : {}),
          });
        }
        if (stillCurrent()) this.emit("message:notification", row);
      }
      if (stillCurrent()) this.emit("message:new", row);
    };
    socket.on("message:new", (payload) => safe(() => receive(payload, false)));
    socket.on("message:notification", (payload) =>
      safe(() => receive(payload, true)),
    );
    socket.on("message:delivered", (payload) =>
      safe(async () => {
        if (!current()) return;
        await messageStore.waitForOutgoing(userId);
        if (!current()) return;
        await messageStore.markDelivered(
          payload.messageId,
          payload.conversationId,
        );
        if (current()) this.emit("message:delivered", payload);
      }),
    );
    socket.on("message:read", (payload) =>
      safe(async () => {
        if (!current()) return;
        await messageStore.waitForOutgoing(userId);
        if (!current()) return;
        if (payload.userId === userId) {
          if (payload.messageId) {
            await messageStore.markRead(
              payload.messageId,
              payload.conversationId,
              userId,
            );
            await receiptQueue.acknowledge("READ", payload.messageId);
          } else {
            await receiptQueue.acknowledgeRoom(payload.conversationId);
          }
        } else if (payload.messageId) {
          await messageStore.markRead(
            payload.messageId,
            payload.conversationId,
          );
        } else {
          await messageStore.markSentMessagesAsRead(
            payload.conversationId,
            userId,
          );
        }
        if (current()) this.emit("message:read", payload);
      }),
    );
    for (const event of [
      "message:deleted",
      "message:deleted-for-me",
    ] as const) {
      socket.on(event, (payload) =>
        safe(async () => {
          if (!current()) return;
          await messageStore.waitForOutgoing(userId);
          if (!current()) return;
          await messageStore.deleteOne(payload.messageId, userId);
          if (current()) this.emit(event, payload);
        }),
      );
    }
    socket.on("message:edited", (payload) =>
      safe(async () => {
        if (!current()) return;
        await messageStore.waitForOutgoing(userId);
        if (!current()) return;
        await messageStore.editText(payload.messageId, payload.content);
        if (current()) this.emit("message:edited", payload);
      }),
    );
    socket.on("conversation:deleted", (payload) =>
      safe(async () => {
        if (!current()) return;
        await messageStore.deleteRoom(payload.conversationId);
        const rooms = await roomStore.findRoom(payload.conversationId);
        if (!current()) return;
        for (const room of rooms) await roomStore.deleteOne(room.id);
        if (current()) this.emit("conversation:deleted", payload);
      }),
    );
    socket.on("message:typing", (payload) => {
      if (current() && payload.userId !== userId)
        this.emit(payload.isTyping ? "typing:start" : "typing:stop", payload);
    });
    for (const event of [
      "presence:online",
      "presence:offline",
      "notification:new",
    ]) {
      socket.on(event, (payload) => {
        if (current()) this.emit(event, payload);
      });
    }
  }

  disconnect(): void {
    this.generation += 1;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.currentUserId = "";
    this.authToken = "";
    this.pendingSync = null;
    this.flushing = null;
    // Screen listeners/reference counts survive token refresh; screens own them.
  }
  retainRoom(conversationId: string): () => void {
    this.roomReferences.set(
      conversationId,
      (this.roomReferences.get(conversationId) ?? 0) + 1,
    );
    this.joinRoom(conversationId);
    return () => this.leaveRoom(conversationId);
  }
  joinRoom(conversationId: string): void {
    if (this.socket?.connected)
      this.socket.emit("conversation:join", conversationId);
  }
  leaveRoom(conversationId: string): void {
    const count = this.roomReferences.get(conversationId) ?? 0;
    if (count > 1) {
      this.roomReferences.set(conversationId, count - 1);
      return;
    }
    this.roomReferences.delete(conversationId);
    if (this.socket?.connected)
      this.socket.emit("conversation:leave", conversationId);
  }
  get isConnected() {
    return this.socket?.connected ?? false;
  }
  emitConversationDelete(conversationId: string) {
    this.socket?.emit("conversation:delete", { conversationId });
  }
  emitTypingStart(conversationId: string, _senderId: string) {
    if (this.isConnected)
      this.socket?.emit("message:typing", { conversationId, isTyping: true });
  }
  emitTypingStop(conversationId: string, _senderId: string) {
    if (this.isConnected)
      this.socket?.emit("message:typing", { conversationId, isTyping: false });
  }
  emitMessageRead(_conversationId: string, _messageId: string) {
    // markVisibleReadIds already queued the receipt atomically with SQLite READ.
    void this.flushReceipts().catch((error) => this.emit("sync:error", error));
  }
  emitMessageDelivered(conversationId: string, messageId: string) {
    void receiptQueue
      .enqueue("DELIVERED", conversationId, [messageId])
      .then(() => this.flushReceipts())
      .catch((error) => this.emit("sync:error", error));
  }

  flushReceipts(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    const socket = this.socket;
    const generation = this.generation;
    const current = () =>
      generation === this.generation &&
      socket === this.socket &&
      Boolean(socket?.connected);
    if (!current()) return Promise.resolve();
    const work = (async () => {
      do {
        this.flushAgain = false;
        let after = "";
        while (current()) {
          const batch = await receiptQueue.getBatch("READ", after);
          if (!batch.length || !current()) break;
          for (const receipt of batch)
            socket!.emit("message:read", {
              conversationId: receipt.conversationId,
              messageId: receipt.messageId,
            });
          after = batch[batch.length - 1].key;
          // READ is removed only on the server's read echo, not merely emit().
        }
        while (current()) {
          const batch = await receiptQueue.getBatch("DELIVERED");
          if (!batch.length || !current()) break;
          await api.post(
            "/messages/delivered",
            { messageIds: batch.map((receipt) => receipt.messageId) },
            this.authToken,
          );
          if (!current()) break;
          for (const receipt of batch) {
            await receiptQueue.acknowledge("DELIVERED", receipt.messageId);
            await messageStore.markDelivered(
              receipt.messageId,
              receipt.conversationId,
            );
          }
        }
      } while (this.flushAgain && current());
    })();
    this.flushing = work;
    void work
      .finally(() => {
        if (this.flushing === work) this.flushing = null;
      })
      .catch(() => {});
    return work;
  }

  syncPendingDelivery(): Promise<void> {
    if (this.pendingSync) return this.pendingSync;
    const generation = this.generation;
    const userId = this.currentUserId;
    const current = () => generation === this.generation && this.isConnected;
    const work = (async () => {
      // The existing endpoint has no documented cursor. Drain acknowledged batches
      // rather than inventing pagination params. Stop if the server doesn't advance.
      let previous = "";
      while (current()) {
        const response = await api.get<{ data: RemoteMessage[] }>(
          "/messages/pending/delivery?limit=200",
          this.authToken,
          { deduplicate: false },
        );
        if (!current()) return;
        const batch = response.data;
        if (!Array.isArray(batch) || !batch.length) return;
        const signature = batch.map((row) => row.id).join(":");
        if (signature === previous)
          throw new Error(
            "Pending delivery endpoint did not advance after acknowledgement.",
          );
        previous = signature;
        for (const remote of batch) {
          if (!current()) return;
          const row = await messageStore.saveReceived(
            normalizeRemoteMessage(remote, userId),
            current,
            userId,
          );
          if (row && row.senderId !== userId)
            await receiptQueue.enqueue("DELIVERED", row.conversationId, [
              row.id!,
            ]);
        }
        await this.flushReceipts();
        if (batch.length < 200) return;
      }
    })();
    this.pendingSync = work;
    void work
      .finally(() => {
        if (this.pendingSync === work) this.pendingSync = null;
      })
      .catch(() => {});
    return work;
  }

  on(event: string, callback: Listener): () => void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    this.listeners.set(event, listeners);
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (!listeners.size) this.listeners.delete(event);
    };
  }
  private emit(event: string, data?: unknown) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(data);
      } catch (error) {
        if (__DEV__)
          console.warn(`[SocketReceiver] ${event} listener failed`, error);
      }
    }
  }
}
export const socketReceiver = new SocketReceiver(
  process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.3:3000",
);
