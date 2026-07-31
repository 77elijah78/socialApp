import { useState, useEffect, useRef, useCallback } from "react";
import { FlatList } from "react-native";
import { messageStore } from "../db/MessageStore";
import { MessageRow } from "../db/schema";
import { socketReceiver } from "../services/SocketReceiver";
import { mediaService } from "../services/MediaService";

interface CurrentUser {
  id: string;
  token: string;
}

interface UseChatParams {
  roomId: string;
  conversationId: string;
  currentUser: CurrentUser;
}

interface UseChatReturn {
  messages: MessageRow[];
  send: (text: string, receiverId: string) => Promise<void>;
  retry: (localId: string, receiverId: string) => Promise<void>;
  deleteMsg: (messageId: string) => Promise<void>;
  editMsg: (messageId: string, newText: string) => Promise<void>;
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
}

export function useChat({ roomId, conversationId, currentUser }: UseChatParams): UseChatReturn {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isConnected, setConnected] = useState(false);
  const [typingUserId, setTyping] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const flatListRef = useRef<FlatList>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => messageStore.getRecent(roomId, 30).then((rows) => setMessages([...rows])), [roomId]);

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  useEffect(() => {
    if (!roomId || !conversationId || !currentUser?.id) return;

    const unsubs: (() => void)[] = [];

    (async () => {
      await reload();
      scrollToEnd(true);

      setIsSyncing(true);
      try {
        if (currentUser.token) {
          await mediaService.message.syncFromServer(conversationId, currentUser.id);
          await reload();
        }
      } catch {
        // Stay offline — SQLite data already shown
      } finally {
        setIsSyncing(false);
        scrollToEnd(false);
      }

      await mediaService.message.markRoomAsRead(roomId);

      socketReceiver.joinRoom(conversationId);
      setConnected(socketReceiver.isConnected);

      unsubs.push(
        socketReceiver.on("connect", () => setConnected(true)),
        socketReceiver.on("disconnect", () => setConnected(false)),

        socketReceiver.on("message:new", async (msg: MessageRow) => {
          if (msg.roomId !== roomId) return;
          await reload();
          scrollToEnd();
          await mediaService.message.markRoomAsRead(roomId);
        }),

        socketReceiver.on(
          "message:delivered",
          async ({ roomId: rid }: { roomId: string }) => {
            if (rid === roomId) await reload();
          },
        ),

        socketReceiver.on(
          "message:read",
          async ({ roomId: rid }: { roomId: string }) => {
            if (rid === roomId) await reload();
          },
        ),

        socketReceiver.on(
          "message:deleted",
          async ({ roomId: rid }: { roomId: string }) => {
            if (rid === roomId) await reload();
          },
        ),

        socketReceiver.on(
          "message:edited",
          async ({ roomId: rid }: { roomId: string }) => {
            if (rid === roomId) await reload();
          },
        ),

        socketReceiver.on(
          "typing:start",
          ({ senderId }: { senderId: string }) => {
            if (senderId !== currentUser.id) setTyping(senderId);
          },
        ),

        socketReceiver.on(
          "typing:stop",
          ({ senderId }: { senderId: string }) => {
            if (senderId !== currentUser.id) setTyping(null);
          },
        ),
      );
    })();

    return () => {
      socketReceiver.leaveRoom(conversationId);
      unsubs.forEach((fn) => fn());
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [roomId, conversationId, currentUser?.id, currentUser?.token, reload, scrollToEnd]);

  const send = async (text: string, receiverId: string) => {
    await mediaService.message.send(text, {
      senderId: currentUser.id,
      receiverId,
      conversationId,
    });
    await reload();
    scrollToEnd();
  };

  const sendMedia = async (type: string, mediaUrl: string | null, receiverId: string) => {
    await mediaService.message.sendMediaRecord(type, mediaUrl, {
      senderId: currentUser.id,
      receiverId,
      conversationId,
    });
    await reload();
    scrollToEnd();
  };

  const retry = async (localId: string, receiverId: string) => {
    await mediaService.message.retry(conversationId, localId, {
      senderId: currentUser.id,
      receiverId,
    });
    await reload();
  };

  const deleteMsg = async (messageId: string) => {
    await mediaService.message.delete(messageId);
    await reload();
  };

  const editMsg = async (messageId: string, newText: string) => {
    await mediaService.message.edit(messageId, newText);
    await reload();
  };

  const loadMore = async () => {
    if (!hasMore || isSyncing || messages.length === 0) return;

    const oldestTimestamp = messages[0]?.timestamp;
    if (!oldestTimestamp) return;

    setIsSyncing(true);
    try {
      const older = await messageStore.getOlderThan(roomId, oldestTimestamp, 20);

      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
      } else {
        const serverOlder = await mediaService.message.syncFromServer(
          conversationId,
          currentUser.id,
        );
        if (serverOlder.length === 0) setHasMore(false);
        await reload();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const onTyping = () => {
    socketReceiver.emitTypingStart(conversationId, currentUser.id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketReceiver.emitTypingStop(conversationId, currentUser.id);
    }, 2000);
  };

  return {
    messages,
    send,
    retry,
    deleteMsg,
    editMsg,
    loadMore,
    onTyping,
    isTyping: !!typingUserId,
    typingUserId,
    isConnected,
    isSyncing,
    hasMore,
    flatListRef,
    sendMedia,
  };
}