import type { db } from "./db";
import { messages, type MessageRow } from "./schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { replyPreview } from "../utils/messaging/presentation";

/** Reply snapshots must never expose a locally deleted original. Run inside
 * the same transaction, including after a stale history batch writes replies. */
export async function synchronizeReplySnapshots(
  tx: Pick<typeof db, "select" | "update">,
  rows: MessageRow[],
): Promise<MessageRow[]> {
  const deleted = new Map<string, MessageRow>();
  for (const row of rows)
    if (row.deletedAt || row.editedAt) deleted.set(row.localId, row);
  const refs = rows.flatMap((row) =>
    row.repliedToId ? [row.repliedToId] : [],
  );
  if (refs.length) {
    const parents = await tx
      .select()
      .from(messages)
      .where(or(inArray(messages.id, refs), inArray(messages.localId, refs)));
    for (const parent of parents)
      if (parent.deletedAt || parent.editedAt)
        deleted.set(parent.localId, parent);
  }
  if (!deleted.size) return rows;
  for (const parent of deleted.values()) {
    await tx
      .update(messages)
      .set({
        replyData: JSON.stringify({
          ...replyPreview(parent),
          content: parent.deletedAt ? "" : (parent.content || "").slice(0, 180),
        }),
      })
      .where(
        and(
          eq(messages.conversationId, parent.conversationId),
          inArray(messages.repliedToId, [
            parent.localId,
            parent.id || parent.localId,
          ]),
        ),
      );
  }
  const ids = rows.filter((row) => row.repliedToId).map((row) => row.localId);
  if (!ids.length) return rows;
  const refreshed = await tx
    .select()
    .from(messages)
    .where(inArray(messages.localId, ids));
  const changed = new Map(refreshed.map((row) => [row.localId, row]));
  return rows.map((row) => changed.get(row.localId) ?? row);
}
