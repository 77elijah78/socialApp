import AsyncStorage from "@react-native-async-storage/async-storage";
import { messageStore } from "../db/MessageStore";
import { roomStore } from "../db/RoomStore";
import { syncStateStore } from "../db/syncStateStore";
import { receiptQueue } from "../db/receiptQueue";
import { clearRecentMessageCache } from "../utils/recentMessageCache";
import { mediaService } from "./MediaService";

const OWNER_KEY = "messaging-cache-owner";
/** Run before changing authenticated identity, never after rendering its cache. */
export async function prepareMessagingAccount(
  userId: string | null,
): Promise<void> {
  const owner = await AsyncStorage.getItem(OWNER_KEY);
  if (!userId || (owner && owner !== userId)) {
    mediaService.message.resetSession();
    mediaService.disconnectSocket();
    clearRecentMessageCache();
    await messageStore.deleteAll();
    await roomStore.deleteAll();
    await receiptQueue.clear();
    await syncStateStore.clear();
  }
  // Legacy caches have no owner. Keep them for the already persisted account;
  // all subsequent account changes are explicitly isolated before login dispatch.
  if (userId) await AsyncStorage.setItem(OWNER_KEY, userId);
  else await AsyncStorage.removeItem(OWNER_KEY);
}
