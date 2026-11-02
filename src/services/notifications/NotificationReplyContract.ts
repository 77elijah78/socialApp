import { isPushUuid } from "./PushInstallation";

export interface NotificationReplyRecord {
  actionId: string; recipientUserId: string; deviceId: string; notificationId: string;
  conversationId: string; messageId: string; content: string;
}
export interface ReplyJournalTransport { send(record: NotificationReplyRecord, token: string): Promise<void> }
/** Exact backend 66cf042 request, with no non-idempotent fallback. */
export function notificationReplyRequest(record: NotificationReplyRecord) {
  if (!record || ![record.actionId, record.recipientUserId, record.deviceId, record.notificationId, record.conversationId, record.messageId].every(isPushUuid) ||
    typeof record.content !== "string" || !record.content.trim() || record.content.length > 5000)
    throw new Error("Invalid notification reply");
  return {
    path: `/messages/conversations/${record.conversationId}/reply`,
    body: { content: record.content, type: "TEXT" as const, repliedToId: record.messageId,
      notificationAction: { contractVersion: 2 as const, actionId: record.actionId,
        recipientUserId: record.recipientUserId, deviceId: record.deviceId, notificationId: record.notificationId } },
  };
}
