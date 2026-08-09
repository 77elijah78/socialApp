import { useState, useEffect, useRef, useCallback } from "react";
import { FlatList } from "react-native";
import { messageStore } from "../db/MessageStore";
import { MessageRow } from "../db/schema";
import { socketReceiver } from "../services/SocketReceiver";
import { mediaService } from "../services/MediaService";
import { router } from "expo-router";

interface CurrentUser {
  id: string;
  token: string;
}

interface UseChatParams {
  roomId?: string;
  conversationId: string;
  currentUser: CurrentUser;
  isFocused?: boolean;
}

interface UseChatReturn {
  messages: MessageRow[];

  send: (text: string, receiverId: string) => Promise<void>;

  retry: (localId: string, receiverId: string) => Promise<void>;

  deleteMsg: (messageId: string) => Promise<void>;

  editMsg: (messageId: string, newText: string) => Promise<void>;

  replyMsg: (
    text: string,
    repliedToId: string,
    receiverId: string,
  ) => Promise<void>;

  loadMore: () => Promise<void>;

  onTyping: () => void;

  isTyping: boolean;
  typingUserId: string | null;
  isConnected: boolean;
  isSyncing: boolean;
  hasMore: boolean;

  flatListRef: React.RefObject<FlatList | null>;

  sendMedia: (
    type: string,
    mediaUrl: string | null,
    receiverId: string,
  ) => Promise<void>;

  markVisibleRead: (visibleMessageIds: string[]) => void;
}

export function useChat({
  conversationId,
  currentUser,
  isFocused,
}: UseChatParams): UseChatReturn {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isConnected, setConnected] = useState(false);
  const [typingUserId, setTyping] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const flatListRef = useRef<FlatList | null>(null);

  const updateMessageStatus = useCallback(
    (messageId: string, status: "DELIVERED" | "READ") => {
      setMessages((previousMessages) =>
        previousMessages.map((message) => {
          const matches =
            message.id === messageId || message.localId === messageId;

          if (!matches) {
            return message;
          }

          return {
            ...message,
            status,
            ...(status === "READ" ? { isRead: true } : {}),
          };
        }),
      );
    },
    [],
  );

  const updateAllOwnMessagesAsRead = useCallback(() => {
    setMessages((previousMessages) =>
      previousMessages.map((message) => {
        if (message.senderId !== currentUserIdRef.current) {
          return message;
        }

        return {
          ...message,
          status: "READ" as const,
          isRead: true,
        };
      }),
    );
  }, []);

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Prevent old async work from updating the new screen.
   */
  const mountedRef = useRef(true);

  /**
   * Prevent duplicate initialization.
   */
  const initializingRef = useRef(false);

  /**
   * Prevent multiple loadMore calls at the same time.
   */
  const loadingMoreRef = useRef(false);

  /**
   * Keep current user available to socket callbacks
   * without recreating all listeners.
   */
  const currentUserIdRef = useRef(currentUser.id);

  useEffect(() => {
    currentUserIdRef.current = currentUser.id;
  }, [currentUser.id]);

  /**
   * ---------------------------------------------------------
   * DEDUPE
   * ---------------------------------------------------------
   *
   * This protects the React list from displaying the same
   * database row more than once.
   *
   * Prefer serverId/messageId if your MessageRow has one.
   * Otherwise fall back to id/localId.
   */
  const dedupeMessages = useCallback((rows: MessageRow[]): MessageRow[] => {
    const seen = new Set<string>();
    const result: MessageRow[] = [];

    for (const row of rows) {
      const item = row as MessageRow & {
        id?: string;
        localId?: string;
        messageId?: string;
        serverId?: string;
      };

      const uniqueId =
        item.serverId ?? item.messageId ?? item.id ?? item.localId;

      /**
       * If there is no usable ID, keep the row.
       */
      if (!uniqueId) {
        result.push(row);
        continue;
      }

      if (seen.has(uniqueId)) {
        continue;
      }

      seen.add(uniqueId);
      result.push(row);
    }

    return result;
  }, []);

  /**
   * ---------------------------------------------------------
   * RELOAD
   * ---------------------------------------------------------
   */
  const reload = useCallback(async () => {
    if (!conversationId) return;

    const rows = await messageStore.getRecent(conversationId, 30);

    if (!mountedRef.current) return;

    setMessages(dedupeMessages(rows));
  }, [conversationId, dedupeMessages]);

  /**
   * ---------------------------------------------------------
   * SCROLL
   * ---------------------------------------------------------
   */
  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => {
      if (!mountedRef.current) return;

      flatListRef.current?.scrollToEnd({
        animated,
      });
    }, 80);
  }, []);

  /**
   * ---------------------------------------------------------
   * INITIALIZE CHAT
   * ---------------------------------------------------------
   */
  useEffect(() => {
    if (!conversationId || !currentUser.id) {
      return;
    }

    mountedRef.current = true;
    initializingRef.current = false;
    loadingMoreRef.current = false;

    /**
     * Reset pagination for a new conversation.
     */
    setHasMore(true);
    setMessages([]);
    setIsSyncing(true);

    /**
     * Prevent callbacks from old screen instance.
     */
    let cancelled = false;

    /**
     * -------------------------------------------------------
     * SOCKET HANDLERS
     * -------------------------------------------------------
     */

    const handleConnect = () => {
      if (cancelled || !mountedRef.current) return;

      setConnected(true);

      /**
       * Rejoin if socket reconnects.
       */
      socketReceiver.joinRoom(conversationId);
    };

    const handleDisconnect = () => {
      if (cancelled || !mountedRef.current) return;

      setConnected(false);
    };

    const handleNewMessage = async (msg: MessageRow) => {
      if (cancelled || !mountedRef.current) {
        return;
      }

      if (msg.conversationId !== conversationId) {
        return;
      }

      const senderId = String(
        (
          msg as MessageRow & {
            senderId?: string;
          }
        ).senderId ?? "",
      );

      const isOwnMessage = senderId === currentUserIdRef.current;

      /**
       * SQLite has already been updated by
       * SocketReceiver.
       */
      await reload();

      if (cancelled || !mountedRef.current) {
        return;
      }

      /**
       * New message should immediately appear.
       */
      scrollToEnd(true);
    };

    const handleDelivered = async ({
      messageId,
      conversationId: cid,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      if (cancelled || !mountedRef.current) {
        return;
      }

      if (cid !== conversationId) {
        return;
      }

      if (!messageId) {
        return;
      }

      console.log("[useChat] message:delivered received", {
        messageId,
        conversationId: cid,
      });

      try {
        /**
         * Persist first so a later reload() does not restore
         * the previous status from SQLite.
         */
        await messageStore.markDelivered(messageId, conversationId);
      } catch (error) {
        console.warn("[useChat] failed to persist delivered status", {
          messageId,
          conversationId,
          error,
        });
      }

      if (cancelled || !mountedRef.current) {
        return;
      }

      /**
       * Update the visible UI immediately.
       */
      updateMessageStatus(messageId, "DELIVERED");
    };

    const handleRead = async ({
      conversationId: cid,
      messageId,
    }: {
      conversationId: string;
      messageId?: string;
    }) => {
      if (cancelled || !mountedRef.current) {
        return;
      }

      if (cid !== conversationId) {
        return;
      }

      /**
       * The backend sent a receipt for one specific message.
       */
      if (messageId) {
        console.log("[useChat] message:read received", {
          messageId,
          conversationId: cid,
        });

        try {
          /**
           * Persist first so reload() keeps the new status.
           */
          await messageStore.markRead(messageId, conversationId);
        } catch (error) {
          console.warn("[useChat] failed to persist read status", {
            messageId,
            conversationId,
            error,
          });
        }

        if (cancelled || !mountedRef.current) {
          return;
        }

        updateMessageStatus(messageId, "READ");
        return;
      }

      /**
       * No messageId means the backend considers all messages
       * sent by the current user in this room as read.
       */
      console.log("[useChat] room read receipt received", {
        conversationId: cid,
      });

      try {
        await messageStore.markSentMessagesAsRead(
          conversationId,
          currentUserIdRef.current,
        );
      } catch (error) {
        console.warn("[useChat] failed to persist room read status", {
          conversationId,
          error,
        });
      }

      if (cancelled || !mountedRef.current) {
        return;
      }

      updateAllOwnMessagesAsRead();
    };

    const handleDeleted = async ({
      conversationId: cid,
    }: {
      conversationId: string;
    }) => {
      if (cancelled || !mountedRef.current) return;

      if (cid !== conversationId) return;

      await reload();
    };

    const handleDeletedForMe = async ({
      conversationId: cid,
    }: {
      conversationId: string;
    }) => {
      if (cancelled || !mountedRef.current) return;

      if (cid !== conversationId) return;

      await reload();
    };

    const handleEdited = async ({
      conversationId: cid,
    }: {
      conversationId: string;
    }) => {
      if (cancelled || !mountedRef.current) return;

      if (cid !== conversationId) return;

      await reload();
    };

    const handleConversationDeleted = async ({
      conversationId: cid,
    }: {
      conversationId: string;
    }) => {
      if (cancelled || !mountedRef.current) return;

      if (cid !== conversationId) return;

      await reload();

      if (!cancelled && mountedRef.current) {
        router.back();
      }
    };

    const handleTypingStart = ({ userId }: { userId: string }) => {
      if (cancelled || !mountedRef.current) return;

      if (userId === currentUserIdRef.current) {
        return;
      }

      setTyping(userId);
    };

    const handleTypingStop = ({ userId }: { userId: string }) => {
      if (cancelled || !mountedRef.current) return;

      if (userId === currentUserIdRef.current) {
        return;
      }

      setTyping((current) => {
        if (current === userId) {
          return null;
        }

        return current;
      });
    };

    /**
     * -------------------------------------------------------
     * REGISTER LISTENERS BEFORE ASYNC INITIALIZATION
     * -------------------------------------------------------
     *
     * This is important.
     *
     * Your old code registered listeners AFTER several
     * await calls. If the screen unmounted during those
     * awaits, cleanup happened before listeners existed.
     *
     * That could leave old listeners alive.
     */
    const unsubs: Array<() => void> = [];

    unsubs.push(socketReceiver.on("connect", handleConnect));

    unsubs.push(socketReceiver.on("disconnect", handleDisconnect));

    unsubs.push(socketReceiver.on("message:new", handleNewMessage));

    unsubs.push(socketReceiver.on("message:delivered", handleDelivered));

    unsubs.push(socketReceiver.on("message:read", handleRead));

    unsubs.push(socketReceiver.on("message:deleted", handleDeleted));

    unsubs.push(
      socketReceiver.on("message:deleted-for-me", handleDeletedForMe),
    );

    unsubs.push(socketReceiver.on("message:edited", handleEdited));

    unsubs.push(
      socketReceiver.on("conversation:deleted", handleConversationDeleted),
    );

    unsubs.push(socketReceiver.on("typing:start", handleTypingStart));

    unsubs.push(socketReceiver.on("typing:stop", handleTypingStop));

    /**
     * Join immediately.
     */
    socketReceiver.joinRoom(conversationId);

    setConnected(socketReceiver.isConnected);

    /**
     * -------------------------------------------------------
     * ASYNC INITIALIZATION
     * -------------------------------------------------------
     */
    const initialize = async () => {
      if (initializingRef.current) {
        return;
      }

      initializingRef.current = true;

      try {
        /**
         * 1. Show local SQLite messages immediately.
         */
        await reload();

        if (cancelled || !mountedRef.current) {
          return;
        }

        scrollToEnd(false);

        /**
         * 2. Synchronize with server.
         */
        if (currentUser.token) {
          try {
            await mediaService.message.syncFromServer(
              conversationId,
              currentUser.id,
            );

            if (cancelled || !mountedRef.current) {
              return;
            }

            /**
             * 3. Reload after synchronization.
             */
            await reload();

            if (cancelled || !mountedRef.current) {
              return;
            }

            scrollToEnd(false);
          } catch (error) {
            /**
             * Offline mode:
             * SQLite messages remain available.
             */
            console.warn("[useChat] sync failed:", error);
          }
        }

        /**
         * IMPORTANT:
         *
         * We no longer mark the conversation as read here.
         * Read receipts are now visibility-based.
         */
      } finally {
        initializingRef.current = false;

        if (!cancelled && mountedRef.current) {
          setIsSyncing(false);
        }
      }
    };

    initialize();

    /**
     * -------------------------------------------------------
     * CLEANUP
     * -------------------------------------------------------
     */
    return () => {
      cancelled = true;
      mountedRef.current = false;

      socketReceiver.leaveRoom(conversationId);

      for (const unsubscribe of unsubs) {
        try {
          unsubscribe();
        } catch (error) {
          console.warn("[useChat] unsubscribe failed:", error);
        }
      }

      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }

      setTyping(null);
    };
  }, [
    conversationId,
    currentUser.id,
    currentUser.token,
    reload,
    scrollToEnd,
    updateMessageStatus,
    updateAllOwnMessagesAsRead,
  ]);

  /**
   * ---------------------------------------------------------
   * VISIBILITY-BASED READ RECEIPTS
   * ---------------------------------------------------------
   *
   * We no longer mark the room as read simply because the
   * screen is focused. Instead, we only mark messages as read
   * when they are actually visible in the FlatList.
   */
  const pendingVisibleReadIdsRef = useRef<Set<string>>(new Set());
  const visibleReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markVisibleRead = useCallback((visibleMessageIds: string[]) => {
    for (const id of visibleMessageIds) {
      pendingVisibleReadIdsRef.current.add(id);
    }

    if (visibleReadTimerRef.current) {
      clearTimeout(visibleReadTimerRef.current);
    }

    visibleReadTimerRef.current = setTimeout(async () => {
      const ids = Array.from(pendingVisibleReadIdsRef.current);
      pendingVisibleReadIdsRef.current.clear();

      if (!conversationId || !currentUserIdRef.current || ids.length === 0) {
        return;
      }

      const localMessages = await messageStore.getByRoom(conversationId);

      const toRead = localMessages.filter((msg) => {
        const msgId = String(msg.id ?? msg.localId ?? "");
        const isVisible = ids.includes(msgId);
        const isReceived = String(msg.senderId ?? "") !== currentUserIdRef.current;
        const isUnread = !msg.isRead;
        const hasId = Boolean(msg.id ?? msg.localId);
        return isVisible && isReceived && isUnread && hasId;
      });

      if (toRead.length === 0) {
        return;
      }

      const readIds = toRead.map((m) => m.id ?? m.localId!).filter(Boolean) as string[];

      setMessages((prev) =>
        prev.map((message) => {
          const key = String(message.id ?? message.localId ?? "");
          if (!readIds.includes(key)) {
            return message;
          }
          return { ...message, status: "READ" as const, isRead: true };
        }),
      );

      try {
        await Promise.all(
          toRead.map((m) => messageStore.markRead(m.id ?? m.localId!, conversationId)),
        );

        for (const m of toRead) {
          socketReceiver.emitMessageRead(conversationId, m.id ?? m.localId!);
        }
      } catch (error) {
        console.warn("[useChat] visibility read persist failed:", error);
      }
    }, 500);
  }, [conversationId]);

  /**
   * ---------------------------------------------------------
   * SEND MESSAGE
   * ---------------------------------------------------------
   */
  const send = useCallback(
    async (text: string, receiverId: string) => {
      if (!text.trim()) {
        return;
      }

      await mediaService.message.send(text, {
        senderId: currentUser.id,
        receiverId,
        conversationId,
      });

      await reload();

      scrollToEnd(true);
    },
    [currentUser.id, conversationId, reload, scrollToEnd],
  );

  /**
   * ---------------------------------------------------------
   * SEND MEDIA
   * ---------------------------------------------------------
   */
  const sendMedia = useCallback(
    async (type: string, mediaUrl: string | null, receiverId: string) => {
      await mediaService.message.sendMediaRecord(type, mediaUrl, {
        senderId: currentUser.id,
        receiverId,
        conversationId,
      });

      await reload();

      scrollToEnd(true);
    },
    [currentUser.id, conversationId, reload, scrollToEnd],
  );

  /**
   * ---------------------------------------------------------
   * RETRY
   * ---------------------------------------------------------
   */
  const retry = useCallback(
    async (localId: string, receiverId: string) => {
      await mediaService.message.retry(conversationId, localId, {
        senderId: currentUser.id,
        receiverId,
      });

      await reload();

      scrollToEnd(true);
    },
    [currentUser.id, conversationId, reload, scrollToEnd],
  );

  /**
   * ---------------------------------------------------------
   * DELETE
   * ---------------------------------------------------------
   */
  const deleteMsg = useCallback(
    async (messageId: string) => {
      await mediaService.message.delete(messageId);

      await reload();
    },
    [reload],
  );

  /**
   * ---------------------------------------------------------
   * EDIT
   * ---------------------------------------------------------
   */
  const editMsg = useCallback(
    async (messageId: string, newText: string) => {
      await mediaService.message.edit(messageId, newText);

      await reload();
    },
    [reload],
  );

  /**
   * ---------------------------------------------------------
   * REPLY
   * ---------------------------------------------------------
   */
  const replyMsg = useCallback(
    async (text: string, repliedToId: string, receiverId: string) => {
      await mediaService.message.replyMessage(
        text,
        {
          senderId: currentUser.id,
          receiverId,
          conversationId,
        },
        repliedToId,
      );

      await reload();

      scrollToEnd(true);
    },
    [currentUser.id, conversationId, reload, scrollToEnd],
  );

  /**
   * ---------------------------------------------------------
   * LOAD MORE
   * ---------------------------------------------------------
   */
  const loadMore = useCallback(async () => {
    if (
      !hasMore ||
      isSyncing ||
      loadingMoreRef.current ||
      messages.length === 0
    ) {
      return;
    }

    const oldestTimestamp = messages[0]?.timestamp;

    if (!oldestTimestamp) {
      return;
    }

    loadingMoreRef.current = true;
    setIsSyncing(true);

    try {
      /**
       * First try local SQLite.
       */
      const older = await messageStore.getOlderThan(
        conversationId,
        oldestTimestamp,
        20,
      );

      if (!mountedRef.current) {
        return;
      }

      if (older.length > 0) {
        setMessages((prev) => {
          return dedupeMessages([...older, ...prev]);
        });

        return;
      }

      /**
       * Nothing older locally.
       *
       * Ask server for older messages.
       */
      const serverOlder = await mediaService.message.syncFromServer(
        conversationId,
        currentUser.id,
      );

      if (!mountedRef.current) {
        return;
      }

      if (!serverOlder || serverOlder.length === 0) {
        setHasMore(false);
        return;
      }

      await reload();
    } finally {
      loadingMoreRef.current = false;

      if (mountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [
    conversationId,
    currentUser.id,
    dedupeMessages,
    hasMore,
    isSyncing,
    messages,
    reload,
  ]);

  /**
   * ---------------------------------------------------------
   * TYPING
   * ---------------------------------------------------------
   */
  const onTyping = useCallback(() => {
    socketReceiver.emitTypingStart(conversationId, currentUser.id);

    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
    }

    typingTimer.current = setTimeout(() => {
      socketReceiver.emitTypingStop(conversationId, currentUser.id);

      typingTimer.current = null;
    }, 2000);
  }, [conversationId, currentUser.id]);

  return {
    messages,

    send,
    retry,
    deleteMsg,
    editMsg,
    replyMsg,
    loadMore,
    onTyping,

    isTyping: !!typingUserId,
    typingUserId,

    isConnected,
    isSyncing,
    hasMore,

    flatListRef,

    sendMedia,

    markVisibleRead,
  };
}
