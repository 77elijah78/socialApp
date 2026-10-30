import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "@/services/api";
import { roomStore } from "@/db/RoomStore";
import { RoomRow } from "@/db/schema";
import { messageStore } from "@/db/MessageStore";
import { useAppSelector } from "@/store/hooks";
import { socketReceiver } from "@/services/SocketReceiver";

interface BackendParticipant {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface BackendConversation {
  id: string;
  isGroup: boolean;
  unreadCount?: number;
  groupName: string | null;
  groupAvatar: string | null;
  updatedAt: string;
  participants: BackendParticipant[];
  messages?: {
    id: string;
    content: string;
    mediaUrl: string | null;
    type: string;
    createdAt: string;
    senderId: string;
    status: string;
    isRead: boolean;
    deletedAt?: string | null;
  }[];
}

interface RoomWithReceiver
  extends Omit<RoomRow, "receiverId" | "lastMessageStatus"> {
  receiverId?: string | null;
  receiverUsername?: string;
  lastMessageStatus?: string;
}

function toRoomRow(
  conversation: BackendConversation,
  currentUserId?: string,
  locallyDeleted = false,
): RoomWithReceiver {
  const otherParticipant = conversation.participants.find(
    (p) => p.user.id !== currentUserId,
  );

  const lastMessage = conversation.messages?.[0];
  const name =
    conversation.isGroup && conversation.groupName
      ? conversation.groupName
      : otherParticipant?.user.displayName ||
        otherParticipant?.user.username ||
        "Unknown";

  const avatarUrl =
    conversation.isGroup && conversation.groupAvatar
      ? conversation.groupAvatar
      : otherParticipant?.user.avatarUrl || "";

  const receiverId = otherParticipant?.user.id;

  const deleted = locallyDeleted || Boolean(lastMessage?.deletedAt);
  const lastMessageContent = deleted ? "Deleted message" : lastMessage?.content || "";
  const type = lastMessage?.type;
  const lastMessageType = deleted ? "text" : lastMessage?.mediaUrl
    ? "media"
    : type === "SHARED_POST" || type === "SHARED_STORY"
      ? type
      : type?.toLowerCase() || "text";
  const lastMessageStatus = lastMessage?.status || "DELIVERED";
  const lastMessageTimestamp = lastMessage
    ? new Date(lastMessage.createdAt).getTime()
    : Date.now();

  const unreadCount =
    conversation.unreadCount ??
    conversation.messages?.filter(
      (m) => m.senderId !== currentUserId && m.status !== "READ",
    ).length ??
    0;

  return {
    id: conversation.id,
    name,
    isGroup: conversation.isGroup,
    participantsData: JSON.stringify(conversation.participants.map(({ user }) => ({ id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }))),
    conversationId: conversation.id,
    avatarUrl,
    lastMessage: lastMessageContent,
    lastMessageType,
    lastMessageTimestamp,
    unreadCount,
    receiverId: receiverId ?? null,
    receiverUsername: otherParticipant?.user.username,
    lastMessageStatus,
    cachedAt: Date.now(),
    updatedAt: Date.now(),
    muted: false,
    pinned: false,
    archived: false,
    cursorOldestTs: null,
    cursorOldestId: null,
  };
}

export function useRooms() {
  const [rooms, setRooms] = useState<RoomWithReceiver[]>([]);
  const [roomsUserId, setRoomsUserId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [syncing, setSyncing] = useState(false);
  const token = useAppSelector((s) => s.auth.token);
  const userId = useAppSelector((s) => s.auth.user?.id);
  const sessionRef = useRef<{
    cancelled: boolean;
    fetch: (() => Promise<void>) | null;
  } | null>(null);

  useEffect(() => {
    const session = {
      cancelled: false,
      fetch: null as (() => Promise<void>) | null,
    };
    sessionRef.current = session;
    let request: Promise<void> | null = null;
    const summaries = new Map<string, RoomWithReceiver>();
    const revisions = new Map<string, number>();
    const paint = () => {
      if (session.cancelled) return;
      setRooms(
        [...summaries.values()].sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.lastMessageTimestamp - a.lastMessageTimestamp ||
            a.id.localeCompare(b.id),
        ),
      );
    };
    const loadLocal = async () => {
      const local = await roomStore.getAllRooms();
      if (session.cancelled) return;
      setRoomsUserId(userId);
      setError(null);
      for (const row of local)
        if (!summaries.has(row.conversationId))
          summaries.set(row.conversationId, row);
      paint();
      setLoading(false); // Cached rooms never wait behind the server spinner.
    };
    const fetchRooms = () => {
      if (request) return request;
      if (!token || !userId || session.cancelled) return Promise.resolve();
      setSyncing(true);
      const started = Date.now();
      const work = (async () => {
        try {
          const response = await api.get<{ data: BackendConversation[] }>(
            "/messages/conversations",
            token,
          );
          if (session.cancelled) return;
          const invalidations = await messageStore.getInvalidations(response.data.flatMap(room => room.messages?.[0]?.id ? [room.messages[0].id] : []));
          const hidden = new Set(invalidations.map(row => `${row.conversationId}:${row.messageId}`));
          if (session.cancelled) return;
          for (const remote of response.data) {
            if (session.cancelled) return;
            const persisted = (await roomStore.findRoom(remote.id))[0];
            if (session.cancelled) return;
            const visible = summaries.get(remote.id);
            const previous =
              persisted && (!visible || persisted.updatedAt > visible.updatedAt)
                ? persisted
                : visible;
            const mapped = toRoomRow(remote, userId, hidden.has(`${remote.id}:${remote.messages?.[0]?.id}`));
            const next = {
              ...mapped,
              muted: previous?.muted ?? mapped.muted,
              pinned: previous?.pinned ?? mapped.pinned,
              archived: previous?.archived ?? mapped.archived,
              unreadCount: mapped.unreadCount,
              ...(previous &&
              (previous.updatedAt >= started ||
                previous.lastMessageTimestamp > mapped.lastMessageTimestamp)
                ? {
                    lastMessage: previous.lastMessage,
                    lastMessageType: previous.lastMessageType,
                    lastMessageTimestamp: previous.lastMessageTimestamp,
                    lastMessageStatus: previous.lastMessageStatus,
                    unreadCount: previous.unreadCount,
                  }
                : {}),
            };
            summaries.set(next.conversationId, next);
            await roomStore.upsertRoom(next);
          }
          paint();
          if (!session.cancelled) setError(null);
        } catch (failure) {
          if (!session.cancelled)
            setError(
              failure instanceof Error ? failure : new Error(String(failure)),
            );
        } finally {
          request = null;
          if (!session.cancelled) {
            setSyncing(false);
            setLoading(false);
          }
        }
      })();
      request = work;
      return work;
    };
    session.fetch = fetchRooms;
    // Serial local-first loading prevents a slow SQLite snapshot overwriting REST.
    void loadLocal()
      .catch((failure) => {
        if (!session.cancelled) {
          setRoomsUserId(userId);
          setRooms([]);
          setError(failure);
          setLoading(false);
        }
      })
      .then(fetchRooms);

    const refreshSummary = async (
      conversationId: string,
      deletedLatest = false,
    ) => {
      const revision = (revisions.get(conversationId) ?? 0) + 1;
      revisions.set(conversationId, revision);
      const [last, persisted] = await Promise.all([
        messageStore.getLastMessage(conversationId),
        roomStore.findRoom(conversationId),
      ]);
      if (session.cancelled) return;
      const previous = summaries.get(conversationId) ?? persisted[0];
      if (session.cancelled) return;
      if (!previous || revisions.get(conversationId) !== revision) return;
      const next = {
        ...previous,
        unreadCount: persisted[0]?.unreadCount ?? previous.unreadCount,
        updatedAt: Date.now(),
        ...(last &&
        (deletedLatest || last.timestamp >= previous.lastMessageTimestamp)
          ? {
              lastMessage: last.content ?? "",
              lastMessageType: last.type.startsWith("SHARED_")
                ? last.type
                : last.type.toLowerCase(),
              lastMessageTimestamp: last.timestamp,
              lastMessageStatus: last.status,
            }
          : deletedLatest
            ? {
                lastMessage: "",
                lastMessageType: "text",
                lastMessageTimestamp: 0,
                lastMessageStatus: "SENT",
              }
            : {}),
      };
      summaries.set(conversationId, next);
      paint();
      const {
        id: _id,
        conversationId: _room,
        unreadCount: _count,
        ...patch
      } = next;
      await roomStore.updateRoom(conversationId, patch);
    };
    const refreshSafely = (conversationId: string, deletedLatest = false) => {
      void refreshSummary(conversationId, deletedLatest).catch((failure) => {
        if (!session.cancelled) setError(failure);
      });
    };
    const unsubscribe = messageStore.subscribe((change) => {
      if (session.cancelled) return;
      if (change.type === "clear") {
        if (change.conversationId) summaries.delete(change.conversationId);
        else summaries.clear();
        paint();
      } else if (change.type === "invalidate") {
        // The original is outside the body cache, so its old unread/summary
        // contribution is unknowable. Reuse authoritative rooms, never guess.
        void fetchRooms();
      } else
        refreshSafely(
          change.conversationId,
          change.rows.some(
            (row) =>
              row.deletedAt &&
              row.timestamp >=
                (summaries.get(change.conversationId)?.lastMessageTimestamp ??
                  0),
          ),
        );
    });
    const notification = socketReceiver.on("message:notification", (row) =>
      refreshSafely(row.conversationId),
    );
    const deleted = socketReceiver.on("conversation:deleted", (row) => {
      summaries.delete(row.conversationId);
      paint();
    });
    const connected = socketReceiver.on("connect", () => {
      void fetchRooms();
    });
    return () => {
      session.cancelled = true;
      unsubscribe();
      notification();
      deleted();
      connected();
    };
  }, [token, userId]);

  const reload = useCallback(async () => {
    await sessionRef.current?.fetch?.();
  }, []);
  const addRoom = useCallback(async (room: RoomRow) => {
    await roomStore.addRoom(room);
    setRooms((previous) => [
      room,
      ...previous.filter((row) => row.conversationId !== room.conversationId),
    ]);
  }, []);
  const deleteRoom = useCallback(async (roomId: string) => {
    await roomStore.deleteOne(roomId);
    setRooms((previous) => previous.filter((row) => row.id !== roomId));
  }, []);
  return {
    rooms: roomsUserId === userId ? rooms : [],
    loading: roomsUserId !== userId || loading,
    error: roomsUserId === userId ? error : null,
    syncing,
    reload,
    addRoom,
    deleteRoom,
  };
}
