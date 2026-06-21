import { roomStore } from "@/db/RoomStore";
import { RoomRow } from "@/db/schema";
import { useCallback, useState } from "react";

export function useRooms() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);

  function uid(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const localId = uid();

  const optimistic = {
    id: localId,
  };

  const reload = useCallback(async () => {
    const rows = await roomStore.getAllRooms();
    setRooms([...rows]); // spread forces new reference → guaranteed re-render
  }, []);

  const addRoom = useCallback(
    async (room: RoomRow) => {
      await roomStore.addRoom(room);
      reload();
    },
    [reload],
  );

  const deleteRoom = useCallback(
    async (roomId: string) => {
      await roomStore.deleteOne(roomId);
      reload();
    },
    [reload],
  );

  const findRoom = useCallback(
    async (conversationId: string) => {
      const room = await roomStore.findRoom(conversationId);
      const payload = {
        conversationId: "12345",
        sender: {
          userName: "John Doe",
          avatarUrl: "https://example.com/avatar.png",
        },
        content: "Hello, World!",
        timestamp: Date.now(),
        type: "text",
        meta: {},
      };
      if (room === true) {
        console.log("reza");
        return room;
      }
      const localId = "1235";
      const re = {
        id: localId,
        name: payload.sender.userName,
        conversationId: payload.conversationId,
        avatarUrl: payload.sender.avatarUrl,
        lastMessage: payload.content,
        lastMessageTimestamp: Date.now(),
        lastMessageType: "text",
        unreadCount: 1,
      };
      roomStore.addRoom(re);
      console.log("Room added:", room);
    },
    [reload],
  );

  return { rooms, reload, addRoom, deleteRoom, findRoom };
}
