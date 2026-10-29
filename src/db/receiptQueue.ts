import { and, eq, gt } from "drizzle-orm";
import { db } from "./db";
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
