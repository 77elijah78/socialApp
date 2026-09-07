import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "@/services/api";
import { roomStore } from "@/db/RoomStore";
import { RoomRow } from "@/db/schema";
import { MessageRow } from "@/db/schema";
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
  }[];
}

interface RoomWithReceiver extends Omit<RoomRow, 'receiverId' | 'lastMessageStatus'> {
  receiverId?: string | null;
  lastMessageStatus?: string;
}

function toRoomRow(conversation: BackendConversation, currentUserId?: string): RoomWithReceiver {
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

  const lastMessageContent = lastMessage?.content || "";
  const type = lastMessage?.type;
  const lastMessageType = lastMessage?.mediaUrl
    ? "media"
    : type === "SHARED_POST" || type === "SHARED_STORY"
    ? type
    : type?.toLowerCase() || "text";
  const lastMessageStatus = lastMessage?.status || "DELIVERED";
  const lastMessageTimestamp = lastMessage ? new Date(lastMessage.createdAt).getTime() : Date.now();
  
  const unreadCount = conversation.messages?.filter(
    (m) => m.senderId !== currentUserId && m.status !== "READ"
  ).length || 0;

  return {
    id: conversation.id,
    name,
    conversationId: conversation.id,
    avatarUrl,
    lastMessage: lastMessageContent,
    lastMessageType,
    lastMessageTimestamp,
    unreadCount,
    receiverId: receiverId ?? null,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [syncing, setSyncing] = useState(false);

  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const cancelledRef = useRef(false);

  const loadLocalRooms = useCallback(async () => {
    const localRooms = await roomStore.getAllRooms();
    const mapped = localRooms.map((r) => ({ ...r } as RoomWithReceiver));
    setRooms(mapped);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!token || !currentUserId) {
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);
    setSyncing(true);

    try {
      const response = await api.get<{ success: boolean; data: BackendConversation[] }>(
        "/messages/conversations",
        token ?? undefined,
      );

      if (!cancelledRef.current) {
        const mapped = response.data.map((c) => toRoomRow(c, currentUserId));
        setRooms(mapped);

        for (const room of mapped) {
          await roomStore.upsertRoom(room);
        }
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        setSyncing(false);
      }
    }
  }, [token, currentUserId]);

  useEffect(() => {
    void loadLocalRooms();
    void fetchConversations();

    const unsub = socketReceiver.on("message:notification", async (msg: MessageRow) => {
      if (!cancelledRef.current) {
        setRooms((prev) => {
          const existingIdx = prev.findIndex((r) => r.conversationId === msg.conversationId);
          const lastMessageContent = msg.content ?? "";
          const lastMessageType = msg.type === "TEXT"
            ? "text"
            : msg.type === "SHARED_POST" || msg.type === "SHARED_STORY"
            ? msg.type
            : "media";

          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              lastMessage: lastMessageContent,
              lastMessageType,
              lastMessageTimestamp: msg.timestamp,
              unreadCount: updated[existingIdx].unreadCount + 1,
            };
            const [moved] = updated.splice(existingIdx, 1);
            return [moved, ...updated];
          } else {
            void fetchConversations();
            return prev;
          }
        });
      }
    });

    const unsubDelete = socketReceiver.on("conversation:deleted", () => {
      if (!cancelledRef.current) {
        void fetchConversations();
      }
    });

    const unsubNewMessage = socketReceiver.on("message:new", async (msg: MessageRow) => {
      if (!cancelledRef.current) {
        setRooms((prev) => {
          const existingIdx = prev.findIndex((r) => r.conversationId === msg.conversationId);
          const lastMessageContent = msg.content ?? "";
          const lastMessageType = msg.type === "TEXT"
            ? "text"
            : msg.type === "SHARED_POST" || msg.type === "SHARED_STORY"
            ? msg.type
            : "media";

          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              lastMessage: lastMessageContent,
              lastMessageType,
              lastMessageTimestamp: msg.timestamp,
              lastMessageStatus: msg.status ?? updated[existingIdx].lastMessageStatus,
            };
            const [moved] = updated.splice(existingIdx, 1);
            return [moved, ...updated];
          } else {
            void fetchConversations();
            return prev;
          }
        });
      }
    });

    return () => {
      cancelledRef.current = true;
      unsub();
      unsubDelete();
      unsubNewMessage();
    };
  }, [fetchConversations, loadLocalRooms]);

  const addRoom = useCallback(async (room: RoomRow) => {
    await roomStore.addRoom(room);
    setRooms((prev) => [...prev, room as RoomWithReceiver]);
  }, []);

  const deleteRoom = useCallback(async (roomId: string) => {
    await roomStore.deleteOne(roomId);
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
  }, []);

  return {
    rooms,
    loading,
    error,
    syncing,
    reload: fetchConversations,
    addRoom,
    deleteRoom,
  };
}
