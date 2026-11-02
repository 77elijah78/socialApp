import type { RoomRow } from "../../db/schema";
import type { MessageAuthorInfo } from "./presentation";
const cache = new Map<
  string,
  { source: string; authors: Map<string, MessageAuthorInfo> }
>();
const empty = new Map<string, MessageAuthorInfo>();
/** Existing conversation participant data supplies display names that the
 * message endpoint omits. Cache parsing, not message bodies, for 20 rooms. */
export function roomAuthors(
  room?: Pick<RoomRow, "conversationId" | "participantsData">,
) {
  if (!room?.participantsData || room.participantsData.length > 524288)
    return empty;
  const cached = cache.get(room.conversationId);
  if (cached?.source === room.participantsData) return cached.authors;
  const authors = new Map<string, MessageAuthorInfo>();
  try {
    const values = JSON.parse(room.participantsData);
    if (Array.isArray(values))
      for (const value of values.slice(0, 2048)) {
        if (value && typeof value.id === "string") authors.set(value.id, value);
      }
  } catch {
    return empty;
  }
  cache.delete(room.conversationId);
  cache.set(room.conversationId, { source: room.participantsData, authors });
  while (cache.size > 20) cache.delete(cache.keys().next().value!);
  return authors;
}
export function clearRoomAuthors() {
  cache.clear();
}
