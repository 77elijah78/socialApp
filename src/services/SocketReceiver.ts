import { io, Socket } from "socket.io-client";
import { messageStore } from "../db/MessageStore";
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

  private currentUserId = "";

  private deliveredAckSet = new Set<string>();

  private reconnectSyncInFlight = false;

  private authToken = "";

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  // =========================================================
  // CONNECT
  // =========================================================

  connect(userId: string, authToken: string): void {
    this.currentUserId = userId;
    this.authToken = authToken;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.deliveredAckSet.clear();
    this.reconnectSyncInFlight = false;

    this.socket = io(this.baseUrl, {
      auth: {
        token: authToken,
      },

      transports: ["websocket"],

      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.bindCoreEvents(userId);
  }

  // =========================================================
  // DISCONNECT
  // =========================================================

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();

    this.socket = null;

    /**
     * Don't clear application listeners here.
     *
     * useChat owns those listeners and will unsubscribe
     * when its screen is destroyed.
     */
    this.currentUserId = "";

    this.deliveredAckSet.clear();
    this.reconnectSyncInFlight = false;
  }

  // =========================================================
  // ROOM
  // =========================================================

  joinRoom(conversationId: string): void {
    if (!this.socket) {
      return;
    }

    if (!this.socket.connected) {
      return;
    }

    this.socket.emit("conversation:join", conversationId);
  }

  leaveRoom(conversationId: string): void {
    if (!this.socket) {
      return;
    }

    this.socket.emit("conversation:leave", conversationId);
  }

  // =========================================================
  // CONVERSATION DELETE
  // =========================================================

  emitConversationDelete(conversationId: string): void {
    this.socket?.emit("conversation:delete", {
      conversationId,
    });
  }

  // =========================================================
  // CONNECTION STATE
  // =========================================================

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // =========================================================
  // CORE SOCKET EVENTS
  // =========================================================

  private bindCoreEvents(currentUserId: string): void {
    const s = this.socket;

    if (!s) {
      return;
    }

    this.currentUserId = currentUserId;

    // -------------------------------------------------------
    // CONNECT
    // -------------------------------------------------------

    s.on("connect", () => {
      const socketAny = this.socket as any;
      const isReconnect = socketAny?.reconnectAttempts ?? 0 > 0;

      console.log("[SocketReceiver] connected:", {
        userId: this.currentUserId,
        socketId: s.id,
        reconnect: isReconnect,
        reconnectAttempt: socketAny?.reconnectAttempts ?? 0,
      });

      this.emit("connect");

      /**
       * Rejoin personal room.
       */
      s.emit("presence:join-personal");

      console.log("[SocketReceiver] user room joined:", `user:${this.currentUserId}`);

      /**
       * Reconnect sync: fetch pending delivery messages
       * and ACK them immediately.
       *
       * Only run on reconnect, not on initial connection.
       */
      if (isReconnect) {
        this.syncPendingDelivery().catch((error) => {
          console.error("[SocketReceiver] syncPendingDelivery error:", error);
        });
      }
    });

    // -------------------------------------------------------
    // DISCONNECT
    // -------------------------------------------------------

    s.on("disconnect", (reason: string) => {
      console.log("[SocketReceiver] disconnected:", reason);

      this.emit("disconnect", reason);
    });

    // -------------------------------------------------------
    // CONNECT ERROR
    // -------------------------------------------------------

    s.on("connect_error", (err: Error) => {
      console.warn("[SocketReceiver] connect error:", err.message);

      this.emit("error", err.message);
    });

    // =======================================================
    // NEW MESSAGE
    // =======================================================

    s.on("message:new", async (payload: any) => {
      try {
        console.log("[SocketReceiver] message:new", payload?.id);

        const message = await this.normalize(payload, currentUserId);

        /**
         * IMPORTANT:
         *
         * Always let MessageStore decide whether this
         * message already exists.
         *
         * Do NOT use processedMessageIds here.
         *
         * message:notification and message:new may
         * represent the same server message.
         */

        if (message.senderId !== currentUserId) {
          await messageStore.saveReceived(message);

          const messageId = String(message.id ?? message.localId ?? "");

          if (messageId && !this.deliveredAckSet.has(messageId)) {
            this.deliveredAckSet.add(messageId);

            this.socket?.emit("message:delivered", {
              conversationId: message.conversationId,
              messageIds: [messageId],
            });

            await messageStore.markDelivered(messageId, message.conversationId);
          }
        }

        /**
         * Immediately notify useChat.
         */
        this.emit("message:new", message);
      } catch (error) {
        console.error("[SocketReceiver] message:new error:", error);
      }
    });

    // =======================================================
    // MESSAGE NOTIFICATION
    // =======================================================

    s.on("message:notification", async (payload: any) => {
      try {
        console.log("[SocketReceiver] message:notification", payload?.id);

        /**
         * Update room information.
         */
        const existing = await roomStore.findRoom(payload.conversationId);

        if (!existing || existing.length === 0) {
          const room = {
            id: uid(),

            name:
              payload.sender?.username ?? payload.senderUsername ?? "Unknown",

            conversationId: payload.conversationId,

            avatarUrl: payload.sender?.avatarUrl ?? payload.avatarUrl ?? "",

            lastMessage: payload.content ?? payload.text ?? "",

            lastMessageType: payload.type ?? "TEXT",

            lastMessageTimestamp: payload.createdAt
              ? new Date(payload.createdAt).getTime()
              : Date.now(),

            unreadCount: 1,

            receiverId: payload.senderId,

            lastMessageStatus: "SENT",

            cachedAt: Date.now(),

            updatedAt: Date.now(),

            muted: false,

            pinned: false,

            archived: false,

            cursorOldestTs: null,

            cursorOldestId: null,
          };

          await roomStore.addRoom(room);
        }

        /**
         * Normalize and save.
         */
        const message = await this.normalize(payload, currentUserId);

        /**
         * saveReceived must be idempotent.
         */
        if (message.senderId !== currentUserId) {
          await messageStore.saveReceived(message);
        }

        /**
         * Notify notification listeners.
         */
        this.emit("message:notification", message);

        /**
         * IMPORTANT FIX:
         *
         * Also notify chat listeners.
         *
         * Previously message:notification added the
         * message ID to processedMessageIds, causing
         * message:new to be ignored.
         *
         * Now the chat gets the message immediately.
         */
        this.emit("message:new", message);
      } catch (error) {
        console.error("[SocketReceiver] notification error:", error);
      }
    });

    // =======================================================
    // DELIVERED
    // =======================================================

    s.on(
      "message:delivered",
      async ({
        messageId,
        conversationId,
      }: {
        messageId: string;
        conversationId: string;
      }) => {
        try {
          console.log("[SocketReceiver] backend ACK received / sender delivery receipt emitted:", {
            messageId,
            conversationId,
            userId: this.currentUserId,
          });

          /**
           * Update the exact message.
           */
          await messageStore.markDelivered(messageId, conversationId);

          /**
           * Immediately update useChat.
           */
          this.emit("message:delivered", {
            messageId,
            conversationId,
          });
        } catch (error) {
          console.error("[SocketReceiver] delivered error:", error);
        }
      },
    );

    // =======================================================
    // READ
    // =======================================================

    s.on(
      "message:read",
      async ({
        conversationId,
        userId,
        messageId,
      }: {
        conversationId: string;
        userId: string;
        messageId?: string;
      }) => {
        try {
          console.log("[SocketReceiver] message:read", {
            conversationId,
            userId,
            messageId,
          });

          /**
           * IMPORTANT:
           *
           * userId is the person who READ the message.
           *
           * If userId !== currentUserId, then another
           * person read OUR message.
           *
           * Therefore mark OUR SENT message as READ.
           */
          if (userId !== currentUserId) {
            if (messageId) {
              /**
               * Prefer exact message when backend
               * provides messageId.
               */
              await messageStore.markRead(messageId, conversationId);
            }
          }

          /**
           * Notify useChat immediately.
           */
          this.emit("message:read", {
            messageId,
            conversationId,
            userId,
          });
        } catch (error) {
          console.error("[SocketReceiver] read error:", error);
        }
      },
    );

    // =======================================================
    // REMOTE DELETE
    // =======================================================

    s.on(
      "message:deleted",
      async ({
        messageId,
        conversationId,
      }: {
        messageId: string;
        conversationId: string;
      }) => {
        try {
          await messageStore.deleteOne(messageId);

          this.emit("message:deleted", {
            messageId,
            conversationId,
          });
        } catch (error) {
          console.error("[SocketReceiver] delete error:", error);
        }
      },
    );

    // =======================================================
    // DELETE FOR ME
    // =======================================================

    s.on(
      "message:deleted-for-me",
      async ({
        messageId,
        conversationId,
      }: {
        messageId: string;
        conversationId: string;
      }) => {
        try {
          await messageStore.deleteOne(messageId);

          this.emit("message:deleted-for-me", {
            messageId,
            conversationId,
          });
        } catch (error) {
          console.error("[SocketReceiver] delete-for-me error:", error);
        }
      },
    );

    // =======================================================
    // EDIT
    // =======================================================

    s.on(
      "message:edited",
      async ({
        messageId,
        conversationId,
        content,
      }: {
        messageId: string;
        conversationId: string;
        content: string;
      }) => {
        try {
          await messageStore.editText(messageId, content);

          this.emit("message:edited", {
            messageId,
            conversationId,
            content,
          });
        } catch (error) {
          console.error("[SocketReceiver] edit error:", error);
        }
      },
    );

    // =======================================================
    // TYPING
    // =======================================================

    s.on(
      "message:typing",
      ({
        userId,
        conversationId,
        isTyping,
      }: {
        userId: string;
        conversationId: string;
        isTyping: boolean;
      }) => {
        if (userId === currentUserId) {
          return;
        }

        if (isTyping) {
          this.emit("typing:start", {
            userId,
            conversationId,
          });
        } else {
          this.emit("typing:stop", {
            userId,
            conversationId,
          });
        }
      },
    );

    // =======================================================
    // PRESENCE
    // =======================================================

    s.on(
      "presence:online",
      ({ userId, username }: { userId: string; username: string }) => {
        this.emit("presence:online", {
          userId,
          username,
        });
      },
    );

    s.on(
      "presence:offline",
      ({ userId, lastSeen }: { userId: string; lastSeen: string }) => {
        this.emit("presence:offline", {
          userId,
          lastSeen,
        });
      },
    );

    // =======================================================
    // CONVERSATION DELETED
    // =======================================================

    s.on(
      "conversation:deleted",
      ({ conversationId }: { conversationId: string }) => {
        this.emit("conversation:deleted", {
          conversationId,
        });
      },
    );

    s.on("notification:new", (payload: any) => {
      this.emit("notification:new", payload);
    });

    /**
     * Join personal notification room.
     */
    s.emit("presence:join-personal");
  }

  // =========================================================
  // NORMALIZE
  // =========================================================

  private async normalize(payload: any, currentUserId: string): Promise<any> {
    const senderId = payload.senderId ?? payload.sender?.id;

    const content = payload.content ?? payload.text ?? null;

    const type = payload.type ?? "TEXT";

    const mediaUrl = payload.mediaUrl ?? null;

    const thumbnailUrl = payload.thumbnailUrl ?? null;

    const createdAt = payload.createdAt ?? payload.timestamp ?? Date.now();

    const timestamp =
      typeof createdAt === "number" ? createdAt : new Date(createdAt).getTime();

    const serverId = payload.id;

    /**
     * Find existing local message.
     */
    let localId = serverId ?? `${senderId}-${timestamp}`;

    if (serverId) {
      const existing = await messageStore.getById(serverId);

      if (existing) {
        localId = existing.localId;
      }
    }

    return {
      localId,

      id: serverId ?? localId,

      content,

      mediaUrl,

      thumbnailUrl,

      type,

      status: senderId === currentUserId ? "SENT" : "DELIVERED",

      senderId,

      receiverId:
        senderId === currentUserId
          ? (payload.receiverId ?? null)
          : currentUserId,

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

  // =========================================================
  // TYPING
  // =========================================================

  emitTypingStart(conversationId: string, _senderId: string): void {
    this.socket?.emit("message:typing", {
      conversationId,
      isTyping: true,
    });
  }

  emitTypingStop(conversationId: string, _senderId: string): void {
    this.socket?.emit("message:typing", {
      conversationId,
      isTyping: false,
    });
  }

  emitMessageRead(conversationId: string, messageId: string): void {
    this.socket?.emit("message:read", {
      conversationId,
      messageId,
    });
  }

  emitMessageDelivered(conversationId: string, messageId: string): void {
    this.socket?.emit("message:delivered", {
      conversationId,
      messageIds: [messageId],
    });
  }

  async syncPendingDelivery(): Promise<void> {
    if (this.reconnectSyncInFlight) {
      return;
    }

    if (!this.socket?.connected || !this.currentUserId) {
      return;
    }

    this.reconnectSyncInFlight = true;

    try {
      const apiBase = `${this.baseUrl.replace(/\/$/, "")}/api/v1`;
      const url = `${apiBase}/messages/pending/delivery?limit=200`;

      console.log("[SocketReceiver] pending sync started:", {
        userId: this.currentUserId,
        socketId: this.socket.id,
        url,
      });

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.authToken}`,
        },
      });

      if (!response.ok) {
        console.warn("[SocketReceiver] syncPendingDelivery failed:", {
          status: response.status,
          userId: this.currentUserId,
          socketId: this.socket.id,
        });
        return;
      }

      const data = await response.json();
      const messages = Array.isArray(data?.data) ? data.data : [];

      console.log("[SocketReceiver] pending message count:", {
        userId: this.currentUserId,
        socketId: this.socket.id,
        count: messages.length,
      });

      for (const msg of messages) {
        try {
          const message = await this.normalize(msg, this.currentUserId);

          const messageId = String(message.id ?? message.localId ?? "");

          console.log("[SocketReceiver] pending message:", {
            userId: this.currentUserId,
            socketId: this.socket.id,
            messageId,
            conversationId: message.conversationId,
          });

          if (message.senderId !== this.currentUserId) {
            await messageStore.saveReceived(message);

            console.log("[SocketReceiver] SQLite save completed:", {
              userId: this.currentUserId,
              socketId: this.socket.id,
              messageId,
            });

            if (messageId && !this.deliveredAckSet.has(messageId)) {
              this.deliveredAckSet.add(messageId);

              this.socket.emit("message:delivered", {
                conversationId: message.conversationId,
                messageIds: [messageId],
              });

              await messageStore.markDelivered(messageId, message.conversationId);

              console.log("[SocketReceiver] delivery ACK emitted (reconnect sync):", {
                userId: this.currentUserId,
                socketId: this.socket.id,
                messageId,
                conversationId: message.conversationId,
              });
            }
          }
        } catch (error) {
          console.error("[SocketReceiver] pending delivery save error:", error);
        }
      }
    } finally {
      this.reconnectSyncInFlight = false;
    }
  }

  // =========================================================
  // APPLICATION LISTENERS
  // =========================================================

  on(event: string, cb: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const listeners = this.listeners.get(event)!;

    listeners.add(cb);

    return () => {
      listeners.delete(cb);

      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  private emit(event: string, data?: any): void {
    const listeners = this.listeners.get(event);

    if (!listeners) {
      return;
    }

    /**
     * Copy the set before iterating.
     *
     * This prevents unsubscribe operations during
     * callbacks from affecting the current iteration.
     */
    [...listeners].forEach((cb) => {
      try {
        cb(data);
      } catch (error) {
        console.error(`[SocketReceiver] listener "${event}" error:`, error);
      }
    });
  }
}

const SOCKET_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.3:3000";

export const socketReceiver = new SocketReceiver(SOCKET_BASE_URL);
