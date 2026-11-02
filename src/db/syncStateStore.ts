import { eq } from "drizzle-orm";
import { db } from "./db";
import { messageSyncState } from "./schema";
export type SyncCheckpoint = typeof messageSyncState.$inferSelect;
export const syncStateStore = {
  async get(conversationId: string) {
    return (
      (
        await db
          .select()
          .from(messageSyncState)
          .where(eq(messageSyncState.conversationId, conversationId))
          .limit(1)
      )[0] ?? null
    );
  },
  async set(checkpoint: SyncCheckpoint) {
    await db
      .insert(messageSyncState)
      .values(checkpoint)
      .onConflictDoUpdate({
        target: messageSyncState.conversationId,
        set: checkpoint,
      });
  },
  async delete(conversationId: string) {
    await db
      .delete(messageSyncState)
      .where(eq(messageSyncState.conversationId, conversationId));
  },
  async clear() {
    await db.delete(messageSyncState);
  },
};
