import { useState, useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import {
  parseMetadata,
  type ReplyPreviewModel,
  type AttachmentInfo,
  type MessageAuthorInfo,
  replyPreview,
} from "../utils/messaging/presentation";
import { roomStore } from "../db/RoomStore";
import { roomAuthors } from "../utils/messaging/roomAuthors";
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
  currentUser: { id: string; token: string } & MessageAuthorInfo;
  isFocused?: boolean;
  canRead?: () => boolean;
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
  roomVersion: string;
  cancelled: boolean;
  rows: MessageRow[];
  loadingMore: boolean;
  hasMore: boolean;
  sync: Promise<void> | null;
  lookup: Map<string, MessageRow>;
  authors: Map<string, string>;
  replyRefs: Map<string, Set<string>>;
  reading: Set<string>;
  readVisible: () => void;
}
const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));
const PAGE_SIZE = 30;

/** Hydrate only quote metadata from scoped local originals, not more timeline
 * rows. One bounded lookup per page/new reply; never a query during render or
 * an unconditional reload for receipt-only changes. */
async function hydrateReplyPreviews(
  rows: MessageRow[],
  roomId: string,
  session: Session,
) {
  const refs = [
    ...new Set(
      rows.flatMap((row) => (row.repliedToId ? [row.repliedToId] : [])),
    ),
  ];
  if (!refs.length) return rows;
  const parents = new Map<string, MessageRow>();
  for (const row of [
    ...rows,
    ...refs.flatMap((id) =>
      session.lookup.get(id) ? [session.lookup.get(id)!] : [],
    ),
  ]) {
    parents.set(row.localId, row);
    if (row.id) parents.set(row.id, row);
  }
  const missing = refs.filter((id) => !parents.has(id));
  for (let offset = 0; offset < missing.length; offset += 200)
    for (const row of await messageStore.getByIds(
      roomId,
      missing.slice(offset, offset + 200),
    )) {
      parents.set(row.localId, row);
      if (row.id) parents.set(row.id, row);
    }
  return rows.map((row) => {
    const original = row.repliedToId ? parents.get(row.repliedToId) : undefined;
    if (!original) return row;
    const local = replyPreview(
      !original.senderData && session.authors.has(original.senderId)
        ? { ...original, senderData: session.authors.get(original.senderId)! }
        : original,
    );
    const remote = parseMetadata<ReplyPreviewModel>(row.replyData);
    const snapshot = local.deleted
      ? local
      : {
          ...local,
          ...remote,
          content: remote?.content || local.content,
          sender: { ...local.sender, ...remote?.sender },
          unavailable: false,
        };
    const replyData = JSON.stringify({
      ...snapshot,
      content: snapshot.deleted ? "" : snapshot.content.slice(0, 180),
    });
    return replyData === row.replyData ? row : { ...row, replyData };
  });
}

function indexSession(session: Session) {
  session.lookup.clear();
  session.replyRefs.clear();
  for (const row of session.rows) {
    session.lookup.set(row.localId, row);
    if (row.id) session.lookup.set(row.id, row);
    if (row.repliedToId) {
      const refs = session.replyRefs.get(row.repliedToId) ?? new Set<string>();
      refs.add(row.localId);
      session.replyRefs.set(row.repliedToId, refs);
    }
  }
}

export function useChat({
  conversationId,
  currentUser,
  isFocused = false,
  canRead,
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
  const visibleSnapshot = useRef({ key, ids: new Set<string>() });
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActive = useRef(false);

  useEffect(() => {
    focusedRef.current = isFocused;
    if (isFocused && sessionRef.current?.key === key)
      sessionRef.current.readVisible();
  }, [isFocused, key]);

  useEffect(() => {
    if (!conversationId || !currentUser.id) return;
    const session: Session = {
      key,
      roomVersion: messageStore.getRoomVersion(conversationId),
      cancelled: false,
      rows: getRecentMessageCache(conversationId)?.messages ?? [],
      loadingMore: false,
      hasMore: true,
      sync: null,
      lookup: new Map(),
      authors: new Map(),
      replyRefs: new Map(),
      reading: new Set(),
      readVisible: () => {},
    };
    sessionRef.current = session;
    if (visibleSnapshot.current.key !== key)
      visibleSnapshot.current = { key, ids: new Set() };
    indexSession(session);
    session.readVisible = () => {
      if (
        session.cancelled ||
        session.roomVersion !== messageStore.getRoomVersion(conversationId) ||
        !focusedRef.current ||
        AppState.currentState !== "active" ||
        (canRead && !canRead()) ||
        visibleSnapshot.current.key !== key
      )
        return;
      const ids = new Set<string>();
      for (const visibleId of visibleSnapshot.current.ids) {
        const row = session.lookup.get(visibleId);
        if (
          row?.id &&
          row.senderId !== currentUser.id &&
          row.status !== "READ" &&
          !row.isRead &&
          !row.deletedAt &&
          !session.reading.has(row.id)
        )
          ids.add(row.id);
      }
      if (!ids.size) return;
      for (const id of ids) session.reading.add(id);
      // FlatList already applies the product's visibility threshold. Persist and
      // flush now; no second timer, touch, render, or unrelated send is required.
      void messageStore
        .markVisibleReadIds([...ids], conversationId, currentUser.id)
        .then(() => {
          if (!session.cancelled)
            socketReceiver.emitMessageRead(conversationId, "");
        })
        .catch((error) => {
          if (!session.cancelled) patch({ syncError: asError(error) });
        })
        .finally(() => {
          for (const id of ids) session.reading.delete(id);
        });
    };
    const patch = (patch: Partial<ChatState>) => {
      if (!session.cancelled)
        setState((previous) =>
          previous.key === key ? { ...previous, ...patch } : previous,
        );
    };
    const merge = (incoming: MessageRow[], sources = incoming) => {
      if (
        session.cancelled ||
        session.roomVersion !== messageStore.getRoomVersion(conversationId)
      )
        return;
      const rows = incoming.map((row) =>
        !row.senderData && session.authors.has(row.senderId)
          ? { ...row, senderData: session.authors.get(row.senderId)! }
          : row,
      );
      // Edits/deletes of an unloaded original still invalidate its LOADED
      // previews. Do not fetch or publish every reply body for a source change.
      const previews: MessageRow[] = [];
      for (const source of sources) {
        if (!source.deletedAt && !source.editedAt) continue;
        const refs = new Set([
          ...(session.replyRefs.get(source.localId) ?? []),
          ...(source.id ? (session.replyRefs.get(source.id) ?? []) : []),
        ]);
        if (!refs.size) continue;
        const data = JSON.stringify({
          ...replyPreview(source),
          content: source.deletedAt ? "" : (source.content || "").slice(0, 180),
        });
        for (const id of refs) {
          const reply = session.lookup.get(id);
          if (reply && reply.replyData !== data)
            previews.push({ ...reply, replyData: data });
        }
      }
      rows.push(...previews);
      const next = mergeMessageRows(session.rows, rows);
      if (next === session.rows) return;
      session.rows = next;
      for (const row of rows) {
        const previous = session.lookup.get(row.localId);
        if (
          previous?.repliedToId &&
          (row.deletedAt || previous.repliedToId !== row.repliedToId)
        )
          session.replyRefs.get(previous.repliedToId)?.delete(row.localId);
        if (!row.deletedAt && row.repliedToId) {
          const refs =
            session.replyRefs.get(row.repliedToId) ?? new Set<string>();
          refs.add(row.localId);
          session.replyRefs.set(row.repliedToId, refs);
        }
        if (row.deletedAt) {
          session.lookup.delete(row.localId);
          if (row.id) session.lookup.delete(row.id);
        } else {
          session.lookup.set(row.localId, row);
          if (row.id) session.lookup.set(row.id, row);
        }
      }
      session.readVisible();
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
        session.lookup.clear();
        patch({ messages: [] });
      } else {
        const oldest = session.rows[0];
        const newReplies = change.rows.filter(
          (row) =>
            row.repliedToId &&
            !session.lookup.has(row.localId) &&
            !(row.id && session.lookup.has(row.id)) &&
            (!oldest || compareMessages(row, oldest) >= 0),
        );
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
          change.rows,
        );
        if (newReplies.length)
          void hydrateReplyPreviews(newReplies, conversationId, session)
            .then((rows) =>
              merge(
                rows.flatMap((row) => {
                  // Hydration may finish after a receipt, edit, deletion, or history
                  // reclamation. Fill metadata on the STILL loaded current row only.
                  const current = session.lookup.get(row.localId);
                  if (!current || current.deletedAt) return [];
                  const hydrated = parseMetadata<ReplyPreviewModel>(
                    row.replyData,
                  );
                  const latest = parseMetadata<ReplyPreviewModel>(
                    current.replyData,
                  );
                  const snapshot = {
                    ...hydrated,
                    ...latest,
                    sender: { ...hydrated?.sender, ...latest?.sender },
                    content: latest?.deleted
                      ? ""
                      : latest?.content || hydrated?.content || "",
                  };
                  return [{ ...current, replyData: JSON.stringify(snapshot) }];
                }),
              ),
            )
            .catch(() => {}); // Keep the server snapshot if optional cache hydration fails.
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
        session.readVisible();
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
      if (next === "active" && focusedRef.current) {
        session.readVisible();
        void synchronize();
        void socketReceiver
          .flushReceipts()
          .catch((error) => patch({ syncError: asError(error) }));
      }
    });
    const releaseRoom = socketReceiver.retainRoom(conversationId);
    setConnected(socketReceiver.isConnected);
    session.readVisible();
    void (async () => {
      try {
        const room = (await roomStore.findRoom(conversationId))[0];
        if (session.cancelled) return;
        session.authors = new Map(
          [...roomAuthors(room)].map(([id, author]) => [
            id,
            JSON.stringify(author),
          ]),
        );
        merge(
          await hydrateReplyPreviews(
            await messageStore.getRecent(conversationId, PAGE_SIZE),
            conversationId,
            session,
          ),
        );
        if (session.cancelled) return;
        await synchronize();
      } catch (error) {
        patch({ syncError: asError(error), isSyncing: false });
      }
    })();

    return () => {
      session.cancelled = true;
      session.reading.clear();
      session.lookup.clear();
      session.authors.clear();
      session.replyRefs.clear();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingActive.current)
        socketReceiver.emitTypingStop(conversationId, currentUser.id);
      typingActive.current = false;
      releaseRoom();
      unsubs.forEach((unsubscribe) => unsubscribe());
      appState.remove();
    };
  }, [conversationId, currentUser.id, hasAuth, key, canRead]);

  const loadMore = useCallback(async () => {
    const session = sessionRef.current;
    if (
      !session ||
      session.cancelled ||
      session.key !== key ||
      session.roomVersion !== messageStore.getRoomVersion(conversationId) ||
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
      if (
        session.cancelled ||
        session.roomVersion !== messageStore.getRoomVersion(conversationId)
      )
        return;
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
        if (
          session.cancelled ||
          session.roomVersion !== messageStore.getRoomVersion(conversationId)
        )
          return;
        older = older.filter((row) => compareMessages(row, oldest) < 0);
        if (!older.length) session.hasMore = false;
      }
      older = await hydrateReplyPreviews(older, conversationId, session);
      if (
        session.cancelled ||
        session.roomVersion !== messageStore.getRoomVersion(conversationId)
      )
        return;
      older = older.map((row) =>
        !row.senderData && session.authors.has(row.senderId)
          ? { ...row, senderData: session.authors.get(row.senderId)! }
          : row,
      );
      session.rows = mergeMessageRows(session.rows, older);
      indexSession(session);
      session.readVisible();
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
      // Retain the actual viewport even before session/focus effects run. Replay
      // on focus, foreground, and relevant committed rows fixes the lost callback.
      visibleSnapshot.current = { key, ids: new Set(ids) };
      const session = sessionRef.current;
      if (session?.key === key && !session.cancelled) session.readVisible();
    },
    [key],
  );

  const loadReplyTarget = useCallback(
    async (targetId: string, current: () => boolean) => {
      const session = sessionRef.current;
      if (!session || session.cancelled || session.key !== key)
        throw new Error("Conversation closed.");
      const active = () =>
        !session.cancelled &&
        session.key === key &&
        session.roomVersion === messageStore.getRoomVersion(conversationId) &&
        current();
      const merge = (rows: MessageRow[]) => {
        if (!active()) return;
        session.rows = mergeMessageRows(
          session.rows,
          rows.map((row) =>
            !row.senderData && session.authors.has(row.senderId)
              ? { ...row, senderData: session.authors.get(row.senderId)! }
              : row,
          ),
        );
        indexSession(session);
        setState((previous) =>
          previous.key === key
            ? { ...previous, messages: session.rows }
            : previous,
        );
      };
      const cached = (
        await messageStore.getByIds(conversationId, [targetId])
      )[0];
      if (cached && !cached.deletedAt && active())
        merge(await messageStore.getFromMessage(conversationId, cached));
      const result = await mediaService.message.loadReplyContext(
        conversationId,
        currentUser.id,
        targetId,
        active,
      );
      merge(await hydrateReplyPreviews(result.rows, conversationId, session));
      return result;
    },
    [conversationId, currentUser.id, key],
  );

  const send = useCallback(
    async (text: string, receiverId: string) => {
      await mediaService.message.send(text, {
        senderId: currentUser.id,
        receiverId,
        conversationId,
        sender: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
        },
      });
    },
    [
      conversationId,
      currentUser.id,
      currentUser.username,
      currentUser.displayName,
      currentUser.avatarUrl,
    ],
  );
  const sendMedia = useCallback(
    async (
      type: string,
      uri: string | null,
      receiverId: string,
      duration?: number,
      repliedToId?: string,
      attachment?: AttachmentInfo,
    ) => {
      await mediaService.message.sendMediaRecord(
        type,
        uri,
        {
          senderId: currentUser.id,
          receiverId,
          conversationId,
          sender: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatarUrl,
          },
        },
        duration,
        repliedToId,
        attachment,
      );
    },
    [
      conversationId,
      currentUser.id,
      currentUser.username,
      currentUser.displayName,
      currentUser.avatarUrl,
    ],
  );
  const replyMsg = useCallback(
    async (text: string, repliedToId: string, receiverId: string) => {
      await mediaService.message.replyMessage(
        text,
        {
          senderId: currentUser.id,
          receiverId,
          conversationId,
          sender: {
            id: currentUser.id,
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatarUrl,
          },
        },
        repliedToId,
      );
    },
    [
      conversationId,
      currentUser.id,
      currentUser.username,
      currentUser.displayName,
      currentUser.avatarUrl,
    ],
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
      session.readVisible();
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
    indexSession(session);
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
    loadReplyTarget,
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
