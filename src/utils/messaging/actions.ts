import type { MessageRow } from "../../db/schema";
import { parseMetadata } from "./presentation";

export const canReplyToMessage = (row: MessageRow) =>
  Boolean(
    row.id &&
      !row.deletedAt &&
      row.status !== "SENDING" &&
      row.status !== "FAILED",
  );

export function deletionRestriction(
  row: MessageRow,
  userId: string,
  mode: "me" | "everyone",
) {
  if (row.deletedAt) return "This message has already been deleted.";
  if (row.status === "SENDING") return "Wait for sending to finish.";
  if (mode === "everyone" && row.senderId !== userId)
    return "You can only delete your own messages for everyone.";
  if (mode === "everyone" && !canReplyToMessage(row))
    return "An unsent message can only be removed for you.";
  return null;
}

/** Copy human-authored text/captions, never serialized share metadata or URLs
 * masquerading as attachment contents. Attachments without text remain selected. */
export function copyableMessageText(row: MessageRow): string | null {
  if (row.deletedAt) return null;
  let content = row.content;
  if (row.type === "SHARED_POST" || row.type === "SHARED_STORY") {
    const share = parseMetadata<{ content?: string; caption?: string }>(
      content,
    );
    content =
      (row.type === "SHARED_POST" ? share?.content : share?.caption) ?? null;
  } else if (!["TEXT", "IMAGE", "VIDEO"].includes(row.type.toUpperCase()))
    return null;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export interface MessageBatchResult {
  succeeded: MessageRow[];
  failed: { row: MessageRow; error: Error }[];
}
/** Existing per-message endpoints, with a bounded number of requests. Result
 * order is input order even when responses finish out of order. */
export async function runMessageBatch(
  rows: readonly MessageRow[],
  action: (row: MessageRow) => Promise<unknown>,
  isCurrent: () => boolean = () => true,
  concurrency = 3,
): Promise<MessageBatchResult> {
  const results: ({ row: MessageRow; error?: Error } | undefined)[] = new Array(
    rows.length,
  );
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(rows.length, Math.max(1, concurrency)) },
      async () => {
        while (isCurrent()) {
          const index = cursor++;
          if (index >= rows.length) return;
          const row = rows[index];
          try {
            await action(row);
            results[index] = { row };
          } catch (error) {
            results[index] = {
              row,
              error: error instanceof Error ? error : new Error(String(error)),
            };
          }
        }
      },
    ),
  );
  return {
    succeeded: results.flatMap((result) =>
      result && !result.error ? [result.row] : [],
    ),
    failed: results.flatMap((result) =>
      result?.error ? [{ row: result.row, error: result.error }] : [],
    ),
  };
}

export function batchFailureText(
  result: MessageBatchResult,
  verb: "deleted" | "forwarded",
) {
  const reasons = [
    ...new Set(
      result.failed.map(({ error }) =>
        error.message.replace(/^Request failed \[\d+\]:?\s*/, ""),
      ),
    ),
  ];
  return `${result.succeeded.length} ${verb}; ${result.failed.length} kept selected. ${reasons.slice(0, 2).join(" ")}`;
}
