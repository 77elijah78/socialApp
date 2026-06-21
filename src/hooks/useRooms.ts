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
    console.log("reload — rows:", rows.length);
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

  return { rooms, reload, addRoom, deleteRoom };
}
