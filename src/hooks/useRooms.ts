import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "@/services/api";
import { roomStore } from "@/db/RoomStore";
import { RoomRow } from "@/db/schema";
import { useAppSelector } from "@/store/hooks";

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

  const lastMessageContent = lastMessage?.content || "";
  const lastMessageType = lastMessage?.mediaUrl ? "media" : "text";

  return {
    id: conversation.id,
    name,
    conversationId: conversation.id,
    avatarUrl,
    lastMessage: lastMessageContent,
    lastMessageType,
    lastMessageTimestamp: lastMessage ? new Date(lastMessage.createdAt).getTime() : Date.now(),
    unreadCount: 0,
    receiverId,
  };
}

export function useRooms() {
  const [rooms, setRooms] = useState<RoomWithReceiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const cancelledRef = useRef(false);

  const fetchConversations = useCallback(async () => {
    if (!token || !currentUserId) {
      setLoading(false);
      return;
    }

    cancelledRef.current = false;
    setLoading(true);

    try {
      const conversations = await api.get<BackendConversation[]>(
        "/messages/conversations",
        token ?? undefined,
      );

      if (!cancelledRef.current) {
        const mapped = conversations.map((c) => toRoomRow(c, currentUserId));
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
      }
    }
  }, [token, currentUserId]);

  useEffect(() => {
    void fetchConversations();

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchConversations]);

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
    reload: fetchConversations,
    addRoom,
    deleteRoom,
  };
}
