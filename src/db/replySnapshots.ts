import type { db } from "./db";
import { messages, messageInvalidations, type MessageRow } from "./schema";
import { and, eq, inArray, or, isNull, ne, sql } from "drizzle-orm";
import { replyPreview } from "../utils/messaging/presentation";

/** Hydrate compact previews from actual local originals without adding/reordering
 * canonical bodies. Deletion invalidations also cover originals never cached. */
export async function synchronizeReplySnapshots(
  tx: Pick<typeof db, "select" | "update">,
  rows: MessageRow[],
): Promise<MessageRow[]> {
  if (!rows.length) return rows;
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    const ids = groups.get(row.conversationId) ?? new Set<string>();
    ids.add(row.localId);
    if (row.id) ids.add(row.id);
    if (row.repliedToId) ids.add(row.repliedToId);
    groups.set(row.conversationId, ids);
  }
  const scope = (conversation: typeof messages.conversationId, id: typeof messages.id | typeof messages.repliedToId) => or(
    ...[...groups].map(([room, ids]) => and(eq(conversation, room), inArray(id, [...ids]))),
  );
  // Only parents with cached children need a snapshot write; never read all
  // reply bodies or all conversation history for a new message/receipt.
  const references = await tx.select({ id: messages.repliedToId, room: messages.conversationId })
    .from(messages).where(scope(messages.conversationId, messages.repliedToId))
    .groupBy(messages.conversationId, messages.repliedToId);
  if (!references.length) return rows;
  const parentClauses = references.map(ref => and(eq(messages.conversationId, ref.room),
    or(eq(messages.id, ref.id!), eq(messages.localId, ref.id!))));
  const parents = await tx.select().from(messages).where(or(...parentClauses));
  for (const parent of parents) {
    const data = JSON.stringify(replyPreview(parent));
    const merged = sql`json_patch(CASE WHEN json_valid(${messages.replyData}) THEN ${messages.replyData} ELSE '{}' END, ${data})`;
    await tx.update(messages).set({ replyData: merged }).where(and(
      eq(messages.conversationId, parent.conversationId),
      inArray(messages.repliedToId, [parent.localId, parent.id || parent.localId]),
      isNull(messages.deletedAt),
      or(isNull(messages.replyData), ne(messages.replyData, merged)),
    ));
  }
  const invalidations = await tx.select().from(messageInvalidations).where(or(
    ...references.map(ref => and(eq(messageInvalidations.conversationId, ref.room), eq(messageInvalidations.messageId, ref.id!))),
  ));
  for (const deleted of invalidations) {
    await redactReplySnapshots(tx, deleted.conversationId, [deleted.messageId]);
  }
  const ids = rows.filter(row => row.repliedToId).map(row => row.localId);
  if (!ids.length) return rows;
  const refreshed = await tx.select().from(messages).where(inArray(messages.localId, ids));
  const changed = new Map(refreshed.map(row => [row.localId, row]));
  return rows.map(row => changed.get(row.localId) ?? row);
}

/** A single indexed write regardless of the number of replies to an original. */
export async function redactReplySnapshots(
  tx: Pick<typeof db, "update">,
  conversationId: string,
  ids: string[],
) {
  const fallback = JSON.stringify({ id: ids[0], senderId: "", type: "TEXT" });
  await tx.update(messages).set({ replyData: sql`json_set(
    CASE WHEN json_valid(${messages.replyData}) THEN ${messages.replyData} ELSE ${fallback} END,
    '$.deleted', json('true'), '$.content', '', '$.mediaUrl', NULL,
    '$.thumbnailUrl', NULL, '$.attachment', NULL, '$.shared', NULL)` }).where(and(
    eq(messages.conversationId, conversationId),
    inArray(messages.repliedToId, ids), isNull(messages.deletedAt),
  ));
}
