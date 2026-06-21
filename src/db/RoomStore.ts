import { roomDeleteQueries } from "./deleteQueries";
import { roomGetQueries } from "./getQueries";
import { roomInsertQueries } from "./insertQueries";
import { NewRoomRow } from "./schema";

export class RoomStore {
    getAllRooms() { 
        return roomGetQueries.getAll();
    } 

    addRoom(room: NewRoomRow) { 
        return roomInsertQueries.insert(room);
    }

    deleteOne(roomId: string) { 
        return roomDeleteQueries.deleteOne(roomId);
    }

    findRoom(conversationId: string) { 
        return roomGetQueries.getByConversationId(conversationId);
    }
}

export const roomStore = new RoomStore();