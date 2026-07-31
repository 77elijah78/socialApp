import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { roomStore } from "@/db/RoomStore";
import { RoomRow } from "@/db/schema";

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
    createdAt: string;
    senderId: string;
  }[];
}

interface RoomWithReceiver extends RoomRow {
  receiverId?: string;
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

  return {
    id: conversation.id,
    name,
    conversationId: conversation.id,
    avatarUrl,
    lastMessage: lastMessage?.content || "",
    lastMessageType: lastMessage?.mediaUrl ? "media" : "text",
    lastMessageTimestamp: lastMessage ? new Date(lastMessage.createdAt).getTime() : Date.now(),
    unreadCount: 0,
    receiverId,
  };
}

export function useRooms() {
  const [rooms, setRooms] = useState<RoomWithReceiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const token = useRef<string | null>(null);
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!token.current || !currentUserId.current) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    let cancelled = false;

    async function fetchConversations() {
      try {
        const conversations = await api.get<BackendConversation[]>(
          "/conversations",
          token.current ?? undefined,
        );

        if (!cancelled) {
          const mapped = conversations.map((c) => toRoomRow(c, currentUserId.current!));
          setRooms(mapped);

          for (const room of mapped) {
            await roomStore.upsertRoom(room);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchConversations();

    return () => {
      cancelled = true;
    };
  }, []);

  const setAuth = useCallback((newToken: string, userId: string) => {
    token.current = newToken;
    currentUserId.current = userId;
  }, []);

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
    reload: () => {},
    addRoom,
    deleteRoom,
    setAuth,
  };
}