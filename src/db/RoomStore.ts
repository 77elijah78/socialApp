import { roomDeleteQueries } from "./deleteQueries";
import { roomGetQueries } from "./getQueries";
import { roomInsertQueries } from "./insertQueries";
import { roomUpdateQueries } from "./updateQueries";
import { NewRoomRow, RoomRow } from "./schema";

export class RoomStore {
  getAllRooms() {
    return roomGetQueries.getAll();
  }

  addRoom(room: NewRoomRow) {
    return roomInsertQueries.insert(room);
  }

  upsertRoom(room: NewRoomRow) {
    return roomInsertQueries.upsert(room);
  }

  updateRoom(conversationId: string, patch: Partial<Omit<RoomRow, "id" | "conversationId">>) {
    return roomUpdateQueries.updateRoom(conversationId, patch);
  }

  deleteOne(roomId: string) {
    return roomDeleteQueries.deleteOne(roomId);
  }

  deleteAll() {
    return roomDeleteQueries.deleteAll();
  }

  findRoom(conversationId: string) {
    return roomGetQueries.getByConversationId(conversationId);
  }
}

export const roomStore = new RoomStore();
