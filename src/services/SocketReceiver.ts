import { API_ORIGIN, requireApiOrigin } from "../config/api";
import { io, type Socket } from "socket.io-client";
import { messageStore } from "../db/MessageStore";
import { roomAuthors } from "../utils/messaging/roomAuthors";
import { roomStore } from "../db/RoomStore";
import { receiptQueue } from "../db/receiptQueue";
import {
  normalizeRemoteMessage,
  type RemoteMessage,
} from "../utils/messaging/serialization";
import { api } from "./api";

interface PendingReceipt {
  messageId: string;
  conversationId: string;
  userId?: string;
  status: "READ" | "DELIVERED";
}
const receiptAttempt = () =>
  `${Date.now()}:${Math.random().toString(36).slice(2)}`;

type Listener = (data?: any) => void;
export class SocketReceiver {
  public socket: Socket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private currentUserId = "";
  private authToken = "";
  private generation = 0;
  private pendingSync: Promise<void> | null = null;
  private receiptSync: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private readFlushing: Promise<void> | null = null;
  private readAgain = false;
  private flushAgain = false;
  private previousUserId = "";
  private readAttemptToken = receiptAttempt();
  private pendingReceipts = new Map<string, PendingReceipt>();
  private receiptSubscription: (() => void) | null = null;
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
    let origin: string;
    try { origin = this.baseUrl || requireApiOrigin(); }
    catch (error) {
      this.emit("sync:error", error);
      this.emit("disconnect", "API is not configured");
      return;
    }
    const socket = io(origin, {
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
      this.readAttemptToken = receiptAttempt();
      socket.emit("presence:join-personal");
      for (const room of this.roomReferences.keys())
        socket.emit("conversation:join", room);
      this.emit("connect");
      safe(() => this.syncPendingDelivery());
      safe(() => this.syncReceiptStatuses());
      safe(() => this.flushReceipts());
    });
    socket.on("receipts:resync", () => {
      if (current()) safe(() => this.recoverReceipts());
    });
    socket.on("disconnect", (reason) => {
      if (current()) {
        this.readAttemptToken = receiptAttempt();
        this.readFlushing = null;
        this.emit("disconnect", reason);
      }
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
      const room = (await roomStore.findRoom(payload.conversationId))[0];
      const isGroup = room?.isGroup === true;
      if (!stillCurrent()) return;
      const incoming = normalizeRemoteMessage(
        payload,
        userId,
        isGroup,
        roomAuthors(room),
      );
      const row = await messageStore.saveReceived(
        incoming,
        stillCurrent,
        userId,
      );
      if (!row || row.deletedAt || !stillCurrent()) return;
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
    // Known messages update immediately, even if another upload/send is still
    // pending. Only an unresolved server identity waits for its own commit.
    this.receiptSubscription = messageStore.subscribe((change) => {
      if (!current()) return;
      if (change.type === "clear") {
        for (const [key, receipt] of this.pendingReceipts)
          if (
            !change.conversationId ||
            receipt.conversationId === change.conversationId
          )
            this.pendingReceipts.delete(key);
        return;
      }
      if (change.type === "invalidate") {
        this.pendingReceipts.delete(`${change.conversationId}:${change.messageId}`);
        return;
      }
      for (const row of change.rows) {
        const receipt = this.pendingReceipts.get(
          `${row.conversationId}:${row.id}`,
        );
        if (receipt) safe(() => this.applyReceipt(receipt, current));
      }
    });
    socket.on("message:delivered", (payload) =>
      safe(async () => {
        await this.applyReceipt({ ...payload, status: "DELIVERED" }, current);
        if (current()) this.emit("message:delivered", payload);
      }),
    );
    socket.on("message:read", (payload) =>
      safe(async () => {
        await this.applyReceipt({ ...payload, status: "READ" }, current);
        if (current()) this.emit("message:read", payload);
      }),
    );
    for (const event of [
      "message:deleted",
      "message:deleted-for-me",
    ] as const) {
      socket.on(event, (payload) =>
        safe(async () => {
          if (!current() || !payload.messageId || !payload.conversationId) return;
          await messageStore.deleteOne(payload.messageId, userId, {
            conversationId: payload.conversationId,
            deleteFor: event === "message:deleted" ? "everyone" : "me",
            deletedAt: payload.deletedAt, deletedBy: payload.deletedBy,
          });
          if (current()) this.emit(event, payload);
        }),
      );
    }
    socket.on("message:edited", (payload) =>
      safe(async () => {
        if (!current() || !payload.messageId || !payload.conversationId) return;
        await messageStore.editText(payload.messageId, payload.content, payload.conversationId);
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

  private async applyReceipt(receipt: PendingReceipt, current: () => boolean) {
    if (!current() || !receipt.messageId || !receipt.conversationId) return;
    const row = (
      await messageStore.getByIds(receipt.conversationId, [receipt.messageId])
    )[0];
    if (!current()) return;
    const key = `${receipt.conversationId}:${receipt.messageId}`;
    if (!row) {
      if (receipt.userId === this.currentUserId) return;
      const existing = this.pendingReceipts.get(key);
      if (existing?.status !== "READ") this.pendingReceipts.set(key, receipt);
      // Unknown IDs are bounded metadata, not optimistic/body duplicates. The
      // server's persisted status is the recovery source after reconnect.
      if (this.pendingReceipts.size > 512)
        this.pendingReceipts.delete(this.pendingReceipts.keys().next().value!);
      // Close the read-before-confirm registration race: confirmation may have
      // committed between the first query and installing this pending entry.
      const committed = (
        await messageStore.getByIds(receipt.conversationId, [receipt.messageId])
      )[0];
      if (current() && committed)
        await this.applyReceipt(
          this.pendingReceipts.get(key) ?? receipt,
          current,
        );
      return;
    }
    this.pendingReceipts.delete(key);
    if (row.deletedAt) return;
    if (receipt.userId === this.currentUserId) {
      // A history fetch on the legacy backend can produce a self-read event
      // for an OWN message. It is not evidence another recipient read it.
      if (row.senderId === this.currentUserId) return;
      if (receipt.status === "READ") {
        await messageStore.markRead(
          receipt.messageId,
          receipt.conversationId,
          this.currentUserId,
        );
        if (current())
          await receiptQueue.acknowledge("READ", receipt.messageId);
      }
      return;
    }
    // Another group member reading an incoming message must not mark it seen
    // by this user. READ on our outgoing message means ANY recipient (product choice).
    if (row.senderId !== this.currentUserId || !receipt.userId) return;
    if (receipt.status === "READ")
      await messageStore.markRead(receipt.messageId, receipt.conversationId);
    else
      await messageStore.markDelivered(
        receipt.messageId,
        receipt.conversationId,
      );
  }

  disconnect(): void {
    this.generation += 1;
    this.receiptSubscription?.();
    this.receiptSubscription = null;
    this.pendingReceipts.clear();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.currentUserId = "";
    this.authToken = "";
    this.pendingSync = null;
    this.receiptSync = null;
    this.flushing = null;
    this.readFlushing = null;
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
    void this.flushReadReceipts().catch((error) =>
      this.emit("sync:error", error),
    );
  }
  emitMessageDelivered(conversationId: string, messageId: string) {
    void receiptQueue
      .enqueue("DELIVERED", conversationId, [messageId])
      .then(() => this.flushReceipts())
      .catch((error) => this.emit("sync:error", error));
  }

  flushReceipts(): Promise<void> {
    // Separate transports: a slow delivered-HTTP request must NEVER hold up a
    // visibility-driven socket read acknowledgement.
    return Promise.all([
      this.flushReadReceipts(),
      this.flushDeliveryReceipts(),
    ]).then(() => undefined);
  }

  private flushReadReceipts(): Promise<void> {
    if (this.readFlushing) {
      this.readAgain = true;
      return this.readFlushing.then(() =>
        this.readAgain ? this.flushReadReceipts() : undefined,
      );
    }
    const socket = this.socket,
      generation = this.generation,
      attempt = this.readAttemptToken;
    const current = () =>
      generation === this.generation &&
      socket === this.socket &&
      attempt === this.readAttemptToken &&
      Boolean(socket?.connected);
    if (!current()) return Promise.resolve();
    const work = (async () => {
      do {
        this.readAgain = false;
        while (current()) {
          const batch = await receiptQueue.claimReads(attempt);
          if (!batch.length || !current()) break;
          for (const receipt of batch) {
            if (!current()) break;
            socket!.emit("message:read", {
              conversationId: receipt.conversationId,
              messageId: receipt.messageId,
            }, (ack: { success?: boolean; error?: string } | undefined) => {
              // The current backend ACK is {success:true}, AFTER durable commit.
              // IDs are bound to this emission; neither emit() nor a stale
              // socket/account callback is a persistence acknowledgement.
              if (!current()) return;
              if (ack?.success === true) {
                void receiptQueue.acknowledge("READ", receipt.messageId)
                  .catch(error => { if (current()) this.emit("sync:error", error); });
              } else if (ack?.success === false) {
                this.emit("sync:error", new Error(ack.error || "The server could not save this read receipt. Reconnect or retry."));
              }
            });
          }
          // Unacknowledged reads remain durable. A self-echo or fresh exact-ID
          // recovery may also confirm them; no timeout or blanket room read.

        }
      } while (this.readAgain && current());
    })();
    this.readFlushing = work;
    void work
      .finally(() => {
        if (this.readFlushing === work) this.readFlushing = null;
      })
      .catch(() => {});
    return work;
  }

  private flushDeliveryReceipts(): Promise<void> {
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

  recoverReceipts(): Promise<void> {
    // A real connection/foreground/server-infrastructure recovery or explicit
    // retry may replay an unconfirmed read. Ordinary message activity cannot.
    this.readAttemptToken = receiptAttempt();
    this.readFlushing = null;
    return Promise.all([this.flushReceipts(), this.syncReceiptStatuses()]).then(
      () => undefined,
    );
  }

  syncReceiptStatuses(): Promise<void> {
    if (this.receiptSync) return this.receiptSync;
    const generation = this.generation,
      userId = this.currentUserId,
      token = this.authToken;
    const current = () =>
      generation === this.generation && userId === this.currentUserId;
    if (!userId || !token) return Promise.resolve();
    const work = (async () => {
      let after = "";
      while (current()) {
        const page = await messageStore.getReceiptCandidates(
          userId,
          after,
          100,
        );
        if (!page.length || !current()) return;
        const requested = new Map(
          page.flatMap((row) => (row.id ? [[row.id, row] as const] : [])),
        );
        const response = await api.post<{
          data: { messageId: string; conversationId: string; status: string }[];
        }>(
          "/messages/receipts/sync",
          { messageIds: [...requested.keys()] },
          token,
        );
        if (!current()) return;
        if (!Array.isArray(response.data))
          throw new Error("Invalid receipt status response");
        const read = new Map<string, string[]>();
        for (const receipt of response.data) {
          const original = requested.get(receipt.messageId);
          if (
            !original ||
            original.conversationId !== receipt.conversationId ||
            !current()
          )
            continue;
          if (receipt.status === "READ") {
            const ids = read.get(receipt.conversationId) ?? [];
            ids.push(receipt.messageId);
            read.set(receipt.conversationId, ids);
          } else if (receipt.status === "DELIVERED") {
            await messageStore.markDelivered(
              receipt.messageId,
              receipt.conversationId,
            );
          }
        }
        // Authoritative authenticated snapshots update only cached own rows;
        // they do not invent an actor, fetch history, or reset the list.
        for (const [room, ids] of read) {
          if (!current()) return;
          await messageStore.markReadIds(ids, room);
        }
        after = page[page.length - 1].localId;
      }
    })();
    this.receiptSync = work;
    void work
      .finally(() => {
        if (this.receiptSync === work) this.receiptSync = null;
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
          const room = (await roomStore.findRoom(remote.conversationId))[0];
          const isGroup = room?.isGroup === true;
          if (!current()) return;
          const row = await messageStore.saveReceived(
            normalizeRemoteMessage(remote, userId, isGroup, roomAuthors(room)),
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
  API_ORIGIN,
);
