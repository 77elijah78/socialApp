import { api } from "../api";
import { roomStore } from "../../db/RoomStore";
import { roomAuthors } from "../../utils/messaging/roomAuthors";
import { toRoomRow, type BackendConversation, type RoomWithReceiver } from "../ConversationService";

/** Reuses the actual active-membership list; this backend has no GET /conversations/:id.
 * No conversation/receiver/group identity is inferred from an untrusted push URL. */
export class ConversationDirectory {
  private accountId = "";
  private generation = 0;
  private flight: Promise<BackendConversation[]> | null = null;
  private cache = new Map<string, RoomWithReceiver>();
  constructor(private getToken: () => string | null) {}
  setAccount(id: string) { if (id !== this.accountId) { this.accountId = id; this.generation++; this.flight = null; this.cache.clear(); } }
  invalidate(id: string) { this.cache.delete(id); }
  async get(id: string, fresh = false): Promise<RoomWithReceiver | null> {
    const accountId = this.accountId, generation = this.generation, token = this.getToken();
    const current = () => generation === this.generation && accountId === this.accountId;
    if (!accountId || !token) return null;
    if (!fresh) {
      const cached = this.cache.get(id);
      if (cached) {
        const local = (await roomStore.findRoom(id))[0];
        return current() ? { ...cached, muted: local?.muted ?? cached.muted } : null;
      }
      const local = (await roomStore.findRoom(id))[0];
      if (!current()) return null;
      // A socket-created sparse row has neither participants nor a proven group name.
      if (local?.participantsData && roomAuthors(local).has(accountId) && Date.now() - local.cachedAt < 300_000) return local;
    }
    let flight = this.flight;
    if (!flight) {
      flight = api.get<{ data: BackendConversation[] }>("/messages/conversations", token)
        .then(response => {
          if (!Array.isArray(response.data)) throw new Error("Invalid conversation response");
          return response.data;
        });
      this.flight = flight;
      void flight.finally(() => { if (this.flight === flight) this.flight = null; }).catch(() => {});
    }
    let conversations: BackendConversation[];
    try { conversations = await flight; }
    catch (error) {
      if (!fresh && current()) {
        // Socket persistence may have created a sparse real room while REST
        // was offline. Its local mute and the message's real sender are still
        // usable; never invent a group name or bypass a fresh tap access check.
        const local = (await roomStore.findRoom(id))[0];
        if (current() && local) return local;
      }
      throw error;
    }
    if (!current()) return null;
    const remote = conversations.find(room => room.id === id && typeof room.isGroup === "boolean" &&
      room.participants?.some(member => member.user?.id === accountId));
    if (!remote) { this.cache.delete(id); return null; }
    const old = (await roomStore.findRoom(id))[0];
    if (!current()) return null;
    const mapped = toRoomRow(remote, accountId);
    const next = { ...mapped, muted: old?.muted ?? mapped.muted, pinned: old?.pinned ?? false,
      archived: old?.archived ?? false, ...(old && old.lastMessageTimestamp >= mapped.lastMessageTimestamp
        ? { lastMessage: old.lastMessage, lastMessageType: old.lastMessageType, lastMessageStatus: old.lastMessageStatus,
          lastMessageTimestamp: old.lastMessageTimestamp, unreadCount: old.unreadCount } : {}) };
    // Do not add another unguarded persistence writer: useRooms/SocketReceiver own
    // summaries. The directory only reads local mute state and caches identities.
    this.cache.set(id, next);
    while (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
    return next;
  }
}
