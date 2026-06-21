import { roomStore } from "@/db/RoomStore";
import { RoomRow } from "@/db/schema";
import { useCallback, useEffect, useRef, useState } from "react";

interface IncomingMessageInfo {
  conversationId: string; // unique id of the chat/sender — from your socket payload
  name?: string; // may be unknown for a stranger
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageType?: string;
  timestamp?: number;
}

export function useRooms() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Guards against an older reload() resolving after a newer one
  const reloadId = useRef(0);

  const reload = useCallback(async () => {
    const current = ++reloadId.current;
    try {
      setError(null);
      const rows = await roomStore.getAllRooms();
      if (current === reloadId.current) setRooms(rows);
    } catch (err) {
      if (current === reloadId.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (current === reloadId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const addRoom = useCallback(
    async (room: RoomRow) => {
      await roomStore.addRoom(room);
      await reload();
    },
    [reload],
  );

  const deleteRoom = useCallback(
    async (roomId: string) => {
      await roomStore.deleteOne(roomId);
      await reload();
    },
    [reload],
  );

  /**
   * Telegram-style behavior: call this whenever a message arrives
   * (e.g. inside your Socket.IO "message" listener).
   * - If a room for that conversation already exists, bumps its preview.
   * - If not (first message from a stranger), creates the room on the fly.
   */
  const ensureRoomForMessage = useCallback(
    async (info: IncomingMessageInfo): Promise<RoomRow> => {
      const room = await roomStore.upsertRoom({
        id: info.conversationId,
        conversationId: info.conversationId,
        name: info.name ?? "Unknown",
        avatarUrl: info.avatarUrl ?? "",
        lastMessage: info.lastMessage ?? "",
        lastMessageType: info.lastMessageType ?? "text",
        lastMessageTimestamp: info.timestamp ?? Date.now(),
        unreadCount: 1,
      });
      await reload();
      return room;
    },
    [reload],
  );

  return {
    rooms,
    loading,
    error,
    reload,
    addRoom,
    deleteRoom,
    ensureRoomForMessage,
  };
}
