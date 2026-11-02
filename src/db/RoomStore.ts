import { roomDeleteQueries } from "./deleteQueries";
import { roomGetQueries } from "./getQueries";
import { roomInsertQueries } from "./insertQueries";
import { roomUpdateQueries } from "./updateQueries";
import { NewRoomRow, RoomRow } from "./schema";

export class RoomStore {
  private syncListeners = new Set<() => void>();
  subscribeSyncRequests(listener: () => void) { this.syncListeners.add(listener); return () => { this.syncListeners.delete(listener); }; }
  requestSync() { for (const listener of this.syncListeners) listener(); }
  private preferenceListeners = new Set<(conversationId: string) => void>();
  subscribePreferences(listener: (conversationId: string) => void) {
    this.preferenceListeners.add(listener);
    return () => { this.preferenceListeners.delete(listener); };
  }
  async setMuted(conversationId: string, muted: boolean) {
    await roomUpdateQueries.updateRoom(conversationId, { muted });
    for (const listener of this.preferenceListeners) listener(conversationId);
  }

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
