import { useState, useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { messageStore } from "../db/MessageStore";
import type { MessageRow } from "../db/schema";
import { socketReceiver } from "../services/SocketReceiver";
import { mediaService } from "../services/MediaService";
import {
  getRecentMessageCache,
  setRecentMessageCache,
} from "../utils/recentMessageCache";
import {
  compareMessages,
  cursorFor,
  mergeMessageRows,
} from "../utils/messaging/timeline";

interface UseChatParams {
  roomId?: string;
  conversationId: string;
  currentUser: { id: string; token: string };
  isFocused?: boolean;
}
interface ChatState {
  key: string;
  messages: MessageRow[];
  isSyncing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  syncError: Error | null;
  paginationError: Error | null;
}
interface Session {
  key: string;
  cancelled: boolean;
  rows: MessageRow[];
  loadingMore: boolean;
  hasMore: boolean;
  sync: Promise<void> | null;
  readIds: Set<string>;
  readTimer: ReturnType<typeof setTimeout> | null;
}
const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));
const PAGE_SIZE = 30;

export function useChat({
  conversationId,
  currentUser,
  isFocused = false,
}: UseChatParams) {
  const key = `${currentUser.id}:${conversationId}`;
  const hasAuth = Boolean(currentUser.token);
  const [state, setState] = useState<ChatState>(() => ({
    key,
    messages: getRecentMessageCache(conversationId)?.messages ?? [],
    isSyncing: true,
    isLoadingMore: false,
    hasMore: true,
    syncError: null,
    paginationError: null,
  }));
  const [isConnected, setConnected] = useState(socketReceiver.isConnected);
  const [typing, setTyping] = useState<{
    conversationId: string;
    userId: string;
  } | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const focusedRef = useRef(isFocused);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  useEffect(() => {
    focusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    if (!conversationId || !currentUser.id) return;
    const session: Session = {
      key,
      cancelled: false,
      rows: getRecentMessageCache(conversationId)?.messages ?? [],
      loadingMore: false,
      hasMore: true,
      sync: null,
      readIds: new Set(),
      readTimer: null,
    };
    sessionRef.current = session;
    const patch = (patch: Partial<ChatState>) => {
      if (!session.cancelled)
        setState((previous) =>
          previous.key === key ? { ...previous, ...patch } : previous,
        );
    };
    const merge = (rows: MessageRow[]) => {
      if (session.cancelled) return;
      const next = mergeMessageRows(session.rows, rows);
      if (next === session.rows) return;
      session.rows = next;
      patch({ messages: session.rows });
      setRecentMessageCache(conversationId, session.rows);
    };
    setState({
      key,
      messages: session.rows,
      isSyncing: true,
      isLoadingMore: false,
      hasMore: true,
      syncError: null,
      paginationError: null,
    });

    // Register before any await. Every callback closes over its own cancellation
    // token; a new room cannot make old async work "mounted" again.
    const unsubscribeStore = messageStore.subscribe((change) => {
      if (
        session.cancelled ||
        (change.conversationId && change.conversationId !== conversationId)
      )
        return;
      if (change.type === "clear") {
        session.rows = [];
        patch({ messages: [] });
      } else {
        const oldest = session.rows[0];
        const loaded = new Set(
          session.rows.flatMap((row) => [row.localId, row.id]),
        );
        merge(
          change.rows.filter(
            (row) =>
              !oldest ||
              loaded.has(row.localId) ||
              loaded.has(row.id) ||
              compareMessages(row, oldest) >= 0,
          ),
        );
      }
    });

    const synchronize = () => {
      if (session.cancelled || session.sync || !hasAuth) return session.sync;
      patch({ isSyncing: true, syncError: null });
      const work = (async () => {
        try {
          await mediaService.message.syncLatest(
            conversationId,
            currentUser.id,
            () => !session.cancelled,
          );
        } catch (error) {
          patch({ syncError: asError(error) });
        } finally {
          session.sync = null;
          patch({ isSyncing: false });
        }
      })();
      session.sync = work;
      return work;
    };
    const unsubs = [
      unsubscribeStore,
      socketReceiver.on("connect", () => {
        if (session.cancelled) return;
        setConnected(true);
        void synchronize();
      }),
      socketReceiver.on("disconnect", () => {
        if (!session.cancelled) setConnected(false);
      }),
      socketReceiver.on("error", () => {
        if (!session.cancelled) setConnected(false);
      }),
      socketReceiver.on("typing:start", (payload) => {
        if (
          !session.cancelled &&
          payload.conversationId === conversationId &&
          payload.userId !== currentUser.id
        )
          setTyping(payload);
      }),
      socketReceiver.on("typing:stop", (payload) => {
        if (!session.cancelled && payload.conversationId === conversationId)
          setTyping(null);
      }),
      socketReceiver.on("conversation:deleted", (payload) => {
        if (
          !session.cancelled &&
          focusedRef.current &&
          payload.conversationId === conversationId
        )
          router.back();
      }),
    ];
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active" && focusedRef.current) void synchronize();
    });
    const releaseRoom = socketReceiver.retainRoom(conversationId);
    setConnected(socketReceiver.isConnected);
    void (async () => {
      try {
        merge(await messageStore.getRecent(conversationId, PAGE_SIZE));
        if (session.cancelled) return;
        await synchronize();
      } catch (error) {
        patch({ syncError: asError(error), isSyncing: false });
      }
    })();

    return () => {
      session.cancelled = true;
      if (session.readTimer) clearTimeout(session.readTimer);
      session.readIds.clear();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingActive.current)
        socketReceiver.emitTypingStop(conversationId, currentUser.id);
      typingActive.current = false;
      releaseRoom();
      unsubs.forEach((unsubscribe) => unsubscribe());
      appState.remove();
    };
  }, [conversationId, currentUser.id, hasAuth, key]);

  const loadMore = useCallback(async () => {
    const session = sessionRef.current;
    if (
      !session ||
      session.cancelled ||
      session.key !== key ||
      session.loadingMore ||
      !session.hasMore ||
      !session.rows.length
    )
      return;
    // Set synchronously, before the first await (React state alone isn't a lock).
    session.loadingMore = true;
    setState((previous) => ({
      ...previous,
      isLoadingMore: true,
      paginationError: null,
    }));
    const oldest = session.rows[0];
    try {
      let older = await messageStore.getOlderThan(
        conversationId,
        cursorFor(oldest),
        PAGE_SIZE,
      );
      if (session.cancelled) return;
      if (!older.length) {
        // Never send a temporary optimistic ID as a server cursor.
        const remoteCursor =
          oldest.id && oldest.status !== "FAILED" && oldest.status !== "SENDING"
            ? { lastId: oldest.id, lastTimestamp: oldest.timestamp }
            : { lastId: "", lastTimestamp: oldest.timestamp };
        older = await mediaService.message.syncFromServer(
          conversationId,
          currentUser.id,
          remoteCursor,
          PAGE_SIZE,
        );
        if (session.cancelled) return;
        older = older.filter((row) => compareMessages(row, oldest) < 0);
        if (!older.length) session.hasMore = false;
      }
      session.rows = mergeMessageRows(session.rows, older);
      setState((previous) =>
        previous.key === key
          ? { ...previous, messages: session.rows, hasMore: session.hasMore }
          : previous,
      );
    } catch (error) {
      if (!session.cancelled)
        setState((previous) =>
          previous.key === key
            ? { ...previous, paginationError: asError(error) }
            : previous,
        );
      // Do not advance a cursor or disable retries after a failed request.
    } finally {
      session.loadingMore = false;
      if (!session.cancelled)
        setState((previous) =>
          previous.key === key
            ? { ...previous, isLoadingMore: false }
            : previous,
        );
    }
  }, [conversationId, currentUser.id, key]);

  const markVisibleRead = useCallback(
    (ids: string[]) => {
      const session = sessionRef.current;
      if (
        !session ||
        session.cancelled ||
        session.key !== key ||
        !focusedRef.current ||
        AppState.currentState !== "active"
      )
        return;
      ids.forEach((id) => session.readIds.add(id));
      if (session.readTimer) return;
      session.readTimer = setTimeout(() => {
        session.readTimer = null;
        if (
          session.cancelled ||
          !focusedRef.current ||
          AppState.currentState !== "active"
        ) {
          session.readIds.clear();
          return;
        }
        const visible = session.readIds;
        session.readIds = new Set();
        const received = session.rows.filter(
          (row) =>
            (visible.has(row.localId) || (row.id && visible.has(row.id))) &&
            row.senderId !== currentUser.id &&
            row.status !== "READ" &&
            !row.deletedAt,
        );
        const readIds = received.flatMap((row) => (row.id ? [row.id] : []));
        if (!readIds.length) return;
        void messageStore
          .markVisibleReadIds(readIds, conversationId, currentUser.id)
          .then(() => {
            if (!session.cancelled)
              for (const id of readIds)
                socketReceiver.emitMessageRead(conversationId, id);
          })
          .catch((error) => {
            if (__DEV__)
              console.warn("[useChat] read persistence failed", error);
          });
      }, 250);
    },
    [conversationId, currentUser.id, key],
  );

  const send = useCallback(
    async (text: string, receiverId: string) => {
      await mediaService.message.send(text, {
        senderId: currentUser.id,
        receiverId,
        conversationId,
      });
    },
    [conversationId, currentUser.id],
  );
  const sendMedia = useCallback(
    async (
      type: string,
      uri: string | null,
      receiverId: string,
      duration?: number,
    ) => {
      await mediaService.message.sendMediaRecord(
        type,
        uri,
        { senderId: currentUser.id, receiverId, conversationId },
        duration,
      );
    },
    [conversationId, currentUser.id],
  );
  const replyMsg = useCallback(
    async (text: string, repliedToId: string, receiverId: string) => {
      await mediaService.message.replyMessage(
        text,
        { senderId: currentUser.id, receiverId, conversationId },
        repliedToId,
      );
    },
    [conversationId, currentUser.id],
  );
  const retry = useCallback(
    async (localId: string, receiverId: string) => {
      await mediaService.message.retry(conversationId, localId, {
        senderId: currentUser.id,
        receiverId,
      });
    },
    [conversationId, currentUser.id],
  );
  const deleteMsg = useCallback(async (id: string) => {
    await mediaService.message.delete(id);
  }, []);
  const editMsg = useCallback(async (id: string, text: string) => {
    await mediaService.message.edit(id, text);
  }, []);

  const onTyping = useCallback(() => {
    if (!typingActive.current)
      socketReceiver.emitTypingStart(conversationId, currentUser.id);
    typingActive.current = true;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketReceiver.emitTypingStop(conversationId, currentUser.id);
      typingActive.current = false;
      typingTimer.current = null;
    }, 2000);
  }, [conversationId, currentUser.id]);

  const refresh = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.cancelled || session.key !== key) return;
    setState((previous) =>
      previous.key === key
        ? { ...previous, syncError: null, isSyncing: true }
        : previous,
    );
    try {
      await mediaService.message.syncLatest(conversationId, currentUser.id);
    } catch (error) {
      if (!session.cancelled)
        setState((previous) =>
          previous.key === key
            ? { ...previous, syncError: asError(error) }
            : previous,
        );
    } finally {
      if (!session.cancelled)
        setState((previous) =>
          previous.key === key ? { ...previous, isSyncing: false } : previous,
        );
    }
  }, [conversationId, currentUser.id, key]);

  // Reclaim history models only on an explicit return to latest. The full cache
  // stays in SQLite and can be paged offline again, without evicting a reader.
  const releaseHistory = useCallback(() => {
    const session = sessionRef.current;
    if (
      !session ||
      session.cancelled ||
      session.key !== key ||
      session.rows.length <= 300 ||
      session.loadingMore
    )
      return;
    session.rows = session.rows.slice(-90);
    session.hasMore = true;
    setState((previous) =>
      previous.key === key
        ? { ...previous, messages: session.rows, hasMore: true }
        : previous,
    );
  }, [key]);

  const active = state.key === key;
  return {
    messages: active ? state.messages : [],
    send,
    sendMedia,
    replyMsg,
    retry,
    deleteMsg,
    editMsg,
    loadMore,
    markVisibleRead,
    onTyping,
    refresh,
    releaseHistory,
    isTyping: typing?.conversationId === conversationId,
    typingUserId:
      typing?.conversationId === conversationId ? typing.userId : null,
    isConnected,
    isOffline: !isConnected,
    isSyncing: active ? state.isSyncing : true,
    isLoadingMore: active && state.isLoadingMore,
    hasMore: !active || state.hasMore,
    syncError: active ? state.syncError : null,
    paginationError: active ? state.paginationError : null,
  };
}
