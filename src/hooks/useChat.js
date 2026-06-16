import { useState, useEffect, useCallback, useRef } from "react";
import { messageStore } from "../services/MessageStore";
import { socketReceiver } from "../services/SocketReceiver";
import { mediaService } from "../services/MediaService";

/**
 * useChat — the single hook your chat screen needs.
 *
 * Returns everything required to drive a Telegram-style FlatList:
 *   messages, send, retry, deleteMsg, editMsg,
 *   isTyping, typingUserId,
 *   isConnected, isSyncing,
 *   loadMore (pagination), flatListRef (auto-scroll)
 *
 * Usage:
 *   const chat = useChat({ roomId, currentUser });
 *
 * @param {{ roomId: string, currentUser: { id, token } }} params
 */
export function useChat({ roomId, currentUser }) {
  const [messages, setMessages]     = useState([]);
  const [isSyncing, setIsSyncing]   = useState(true);
  const [isConnected, setConnected] = useState(false);
  const [typingUserId, setTyping]   = useState(null);
  const [hasMore, setHasMore]       = useState(true);

  const flatListRef = useRef(null);
  const pageRef     = useRef(1);
  const typingTimer = useRef(null);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const _reload = useCallback(async () => {
    const stored = await messageStore.getRecent(roomId, 30);
    setMessages(stored);
  }, [roomId]);

  const _scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  // ─── Init: load local → sync server → subscribe socket ───────────────────

  useEffect(() => {
    if (!roomId || !currentUser?.id) return;

    let unsubs = [];

    (async () => {
      // 1. Show local messages immediately (zero-latency)
      await _reload();
      setIsSyncing(true);
      _scrollToEnd(false);

      // 2. Sync from server (catches offline messages)
      try {
        await mediaService.message.syncFromServer(
          roomId,
          currentUser.id
        );
        await _reload();
      } catch {
        // offline — local cache is still shown
      } finally {
        setIsSyncing(false);
        _scrollToEnd(false);
      }

      // 3. Mark received messages as read
      await mediaService.message.markRoomAsRead(roomId);

      // 4. Join socket room
      socketReceiver.joinRoom(roomId);

      // 5. Subscribe to real-time events
      unsubs = [
        socketReceiver.on("connect",    () => setConnected(true)),
        socketReceiver.on("disconnect", () => setConnected(false)),

        socketReceiver.on("message:new", async (msg) => {
          if (msg.roomId !== roomId) return;
          await _reload();
          _scrollToEnd();
          // Mark incoming as read right away (room is open)
          await mediaService.message.markRoomAsRead(roomId);
        }),

        socketReceiver.on("message:delivered", async ({ roomId: rid }) => {
          if (rid !== roomId) return;
          await _reload();
        }),

        socketReceiver.on("message:read", async ({ roomId: rid }) => {
          if (rid !== roomId) return;
          await _reload();
        }),

        socketReceiver.on("message:deleted", async ({ roomId: rid }) => {
          if (rid !== roomId) return;
          await _reload();
        }),

        socketReceiver.on("message:edited", async ({ roomId: rid }) => {
          if (rid !== roomId) return;
          await _reload();
        }),

        socketReceiver.on("typing:start", ({ senderId }) => {
          if (senderId !== currentUser.id) setTyping(senderId);
        }),

        socketReceiver.on("typing:stop", ({ senderId }) => {
          if (senderId !== currentUser.id) setTyping(null);
        }),
      ];

      setConnected(socketReceiver.isConnected);
    })();

    return () => {
      socketReceiver.leaveRoom(roomId);
      unsubs.forEach((fn) => fn());
    };
  }, [roomId, currentUser?.id]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Send a text message. Optimistic — appears in list before server confirms.
   * @param {string} text
   * @param {string} receiverId
   */
  const send = useCallback(
    async (text, receiverId) => {
      await mediaService.message.send(text, {
        senderId:   currentUser.id,
        receiverId,
        roomId,
      });
      await _reload();
      _scrollToEnd();
    },
    [roomId, currentUser?.id]
  );

  /**
   * Retry a failed message.
   * @param {string} localId
   * @param {string} receiverId
   */
  const retry = useCallback(
    async (localId, receiverId) => {
      await mediaService.message.retry(roomId, localId, {
        senderId:   currentUser.id,
        receiverId,
      });
      await _reload();
    },
    [roomId, currentUser?.id]
  );

  /**
   * Delete a message.
   * @param {string} messageId
   */
  const deleteMsg = useCallback(
    async (messageId) => {
      await mediaService.message.delete(roomId, messageId);
      await _reload();
    },
    [roomId]
  );

  /**
   * Edit a message.
   * @param {string} messageId
   * @param {string} newText
   */
  const editMsg = useCallback(
    async (messageId, newText) => {
      await mediaService.message.edit(roomId, messageId, newText);
      await _reload();
    },
    [roomId]
  );

  /**
   * Load older messages (call when FlatList reaches top).
   * @param {string} receiverId
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || isSyncing) return;
    pageRef.current += 1;
    setIsSyncing(true);
    try {
      const older = await mediaService.message.syncFromServer(
        roomId,
        currentUser.id,
        pageRef.current
      );
      if (older.length === 0) setHasMore(false);
      await _reload();
    } finally {
      setIsSyncing(false);
    }
  }, [hasMore, isSyncing, roomId, currentUser?.id]);

  // ─── Typing indicator ────────────────────────────────────────────────────

  /**
   * Call on every keystroke in the input box.
   * Automatically emits typing:stop after 2 s of silence.
   */
  const onTyping = useCallback(() => {
    socketReceiver.emitTypingStart(roomId, currentUser.id);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketReceiver.emitTypingStop(roomId, currentUser.id);
    }, 2000);
  }, [roomId, currentUser?.id]);

  // ─── Return ───────────────────────────────────────────────────────────────

  return {
    messages,       // Message[] sorted oldest → newest for FlatList
    send,
    retry,
    deleteMsg,
    editMsg,
    loadMore,
    onTyping,
    isTyping:    !!typingUserId,
    typingUserId,
    isConnected,
    isSyncing,
    hasMore,
    flatListRef,  // attach to <FlatList ref={flatListRef} />
  };
}
