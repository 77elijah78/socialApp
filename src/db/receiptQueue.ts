import { and, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import { receiptOutbox } from "./schema";

type Kind = "READ" | "DELIVERED";
export const receiptQueue = {
  async enqueue(kind: Kind, conversationId: string, messageIds: string[]) {
    if (!messageIds.length) return;
    await db
      .insert(receiptOutbox)
      .values(
        messageIds.map((messageId) => ({
          key: `${kind}:${messageId}`,
          kind,
          conversationId,
          messageId,
        })),
      )
      .onConflictDoNothing();
  },
  getBatch(kind: Kind, afterKey = "", limit = 100) {
    return db
      .select()
      .from(receiptOutbox)
      .where(and(eq(receiptOutbox.kind, kind), gt(receiptOutbox.key, afterKey)))
      .orderBy(receiptOutbox.key)
      .limit(limit);
  },
  /** Claim at most once per socket connection, without an ever-growing RAM
   * dedupe set. The durable row remains until an authoritative confirmation.
   * A new connection token replays unconfirmed reads after offline/restart. */
  claimReads(attemptToken: string, limit = 100) {
    return withDatabaseTransaction(async (tx) => {
      const batch = await tx
        .select()
        .from(receiptOutbox)
        .where(
          and(
            eq(receiptOutbox.kind, "READ"),
            or(
              isNull(receiptOutbox.attemptToken),
              ne(receiptOutbox.attemptToken, attemptToken),
            ),
          ),
        )
        .orderBy(receiptOutbox.key)
        .limit(limit);
      if (!batch.length) return [];
      await tx
        .update(receiptOutbox)
        .set({ attemptToken })
        .where(
          inArray(
            receiptOutbox.key,
            batch.map((row) => row.key),
          ),
        );
      return batch;
    });
  },
  async acknowledge(kind: Kind, messageId: string) {
    await db
      .delete(receiptOutbox)
      .where(eq(receiptOutbox.key, `${kind}:${messageId}`));
  },
  async acknowledgeRoom(conversationId: string) {
    await db
      .delete(receiptOutbox)
      .where(
        and(
          eq(receiptOutbox.conversationId, conversationId),
          eq(receiptOutbox.kind, "READ"),
        ),
      );
  },
  async deleteRoom(conversationId: string) {
    await db
      .delete(receiptOutbox)
      .where(eq(receiptOutbox.conversationId, conversationId));
  },
  async clear() {
    await db.delete(receiptOutbox);
  },
};
