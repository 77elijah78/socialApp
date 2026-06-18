import { useState, useEffect, useCallback, useRef } from "react";
import { FlatList } from "react-native";
import { messageStore } from "../db/MessageStore";
import { MessageRow }   from "../db/schema";
import { socketReceiver } from "../services/SocketReceiver";
import { mediaService }   from "../services/MediaService";

interface CurrentUser {
  id:    string;
  token: string;
}

interface UseChatParams {
  roomId:      string;
  currentUser: CurrentUser;
}

interface UseChatReturn {
  messages:     MessageRow[];
  send:         (text: string, receiverId: string) => Promise<void>;
  retry:        (localId: string, receiverId: string) => Promise<void>;
  deleteMsg:    (messageId: string) => Promise<void>;
  editMsg:      (messageId: string, newText: string) => Promise<void>;
  loadMore:     () => Promise<void>;
  onTyping:     () => void;
  isTyping:     boolean;
  typingUserId: string | null;
  isConnected:  boolean;
  isSyncing:    boolean;
  hasMore:      boolean;
  flatListRef:  React.RefObject<FlatList | null>;
}

/**
 * useChat — drives the entire Telegram-style chat screen.
 *
 * On mount:
 *   1. Loads recent messages from SQLite instantly (zero-latency first render)
 *   2. Syncs with server in background (catches offline messages)
 *   3. Joins the socket room + subscribes to all real-time events
 *
 * On unmount:
 *   - Leaves the socket room + cleans up all subscriptions
 */
export function useChat({ roomId, currentUser }: UseChatParams): UseChatReturn {
  const [messages,     setMessages]  = useState<MessageRow[]>([]);
  const [isSyncing,    setIsSyncing] = useState(true);
  const [isConnected,  setConnected] = useState(false);
  const [typingUserId, setTyping]    = useState<string | null>(null);
  const [hasMore,      setHasMore]   = useState(true);

  const flatListRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Read the latest 30 messages from SQLite and push to state.
   * Cheap local read — call after every mutation.
   */
  const reload = useCallback(async () => {
    const rows = await messageStore.getRecent(roomId, 30);
    setMessages([...rows]); // spread forces new reference → guaranteed re-render
  }, [roomId]);

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  // ─── Mount / unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !currentUser?.id) return;

    const unsubs: Array<() => void> = [];

    (async () => {
      // 1. Instant local render from SQLite
      await reload();
      scrollToEnd(true);

      // 2. Background server sync (handles offline gap)
      setIsSyncing(true);
      try {
        await mediaService.message.syncFromServer(roomId, currentUser.id);
        await reload();
      } catch {
        // Stay offline — SQLite data already shown
      } finally {
        setIsSyncing(false);
        scrollToEnd(false);
      }

      // 3. Mark this room as read
      await mediaService.message.markRoomAsRead(roomId);

      // 4. Join socket room
      socketReceiver.joinRoom(roomId);
      setConnected(socketReceiver.isConnected);

      // 5. Subscribe to real-time events
      unsubs.push(
        socketReceiver.on("connect",    () => setConnected(true)),
        socketReceiver.on("disconnect", () => setConnected(false)),

        // New message — SocketReceiver already saved it to SQLite, just reload
        socketReceiver.on("message:new", async (msg: MessageRow) => {
          if (msg.roomId !== roomId) return;
          await reload();
          scrollToEnd();
          await mediaService.message.markRoomAsRead(roomId);
        }),

        // Status updates — SQLite already updated by SocketReceiver, just reload
        socketReceiver.on("message:delivered", async ({ roomId: rid }: { roomId: string }) => {
          if (rid === roomId) await reload();
        }),

        socketReceiver.on("message:read", async ({ roomId: rid }: { roomId: string }) => {
          if (rid === roomId) await reload();
        }),

        socketReceiver.on("message:deleted", async ({ roomId: rid }: { roomId: string }) => {
          if (rid === roomId) await reload();
        }),

        socketReceiver.on("message:edited", async ({ roomId: rid }: { roomId: string }) => {
          if (rid === roomId) await reload();
        }),

        // Typing — no SQLite write, just UI state
        socketReceiver.on("typing:start", ({ senderId }: { senderId: string }) => {
          if (senderId !== currentUser.id) setTyping(senderId);
        }),

        socketReceiver.on("typing:stop", ({ senderId }: { senderId: string }) => {
          if (senderId !== currentUser.id) setTyping(null);
        })
      );
    })();

    return () => {
      socketReceiver.leaveRoom(roomId);
      unsubs.forEach((fn) => fn());
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [roomId, currentUser?.id]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Send a text message.
   * MessageService saves it optimistically to SQLite → reload → UI updates
   * before the server even responds.
   */
  const send = useCallback(async (text: string, receiverId: string) => {
    await mediaService.message.send(text, {
      senderId:   currentUser.id,
      receiverId,
      roomId,
    });
    await reload();
    scrollToEnd();
  }, [roomId, currentUser?.id]);

  /**
   * Retry a failed message by its localId.
   */
  const retry = useCallback(async (localId: string, receiverId: string) => {
    await mediaService.message.retry(roomId, localId, {
      senderId:   currentUser.id,
      receiverId,
    });
    await reload();
  }, [roomId, currentUser?.id]);

  /**
   * Delete a message locally + on the server.
   */
  const deleteMsg = useCallback(async (messageId: string) => {
    await mediaService.message.delete(roomId, messageId);
    await reload();
  }, [roomId]);

  /**
   * Edit a message locally + on the server.
   */
  const editMsg = useCallback(async (messageId: string, newText: string) => {
    await mediaService.message.edit(roomId, messageId, newText);
    await reload();
  }, [roomId]);

  /**
   * Load older messages when the user scrolls to the top.
   * Uses the oldest currently loaded message as the cursor.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || isSyncing || messages.length === 0) return;

    const oldestTimestamp = messages[0]?.timestamp;
    if (!oldestTimestamp) return;

    setIsSyncing(true);
    try {
      // First try SQLite (already cached)
      const older = await messageStore.getOlderThan(roomId, oldestTimestamp, 20);

      if (older.length > 0) {
        // Prepend older messages to current list
        setMessages((prev) => [...older, ...prev]);
      } else {
        // Nothing in SQLite — try server
        const serverOlder = await mediaService.message.syncFromServer(
          roomId,
          currentUser.id,
          // pass cursor as a custom param if your API supports it
        );
        if (serverOlder.length === 0) setHasMore(false);
        await reload();
      }
    } finally {
      setIsSyncing(false);
    }
  }, [hasMore, isSyncing, messages, roomId, currentUser?.id]);

  /**
   * Call on every TextInput keystroke.
   * Emits typing:start to the socket and auto-stops after 2 s of silence.
   */
  const onTyping = useCallback(() => {
    socketReceiver.emitTypingStart(roomId, currentUser.id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketReceiver.emitTypingStop(roomId, currentUser.id);
    }, 2000);
  }, [roomId, currentUser?.id]);

  // ─── Return ───────────────────────────────────────────────────────────────

  return {
    messages,
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
    flatListRef,
  };
}