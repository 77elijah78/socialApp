import { ApiError } from "../api";
import { apiUrl } from "../../config/api";
import { isPushUuid } from "./PushInstallation";
import { notificationReplyRequest, type NotificationReplyRecord, type ReplyJournalTransport } from "./NotificationReplyContract";

/** Uses only the explicitly account-bound token; background tasks must never
 * borrow the foreground HTTP client's refresh token from another account. */
export class NotificationReplyTransport implements ReplyJournalTransport {
  async send(record: NotificationReplyRecord, token: string): Promise<void> {
    const request = notificationReplyRequest(record);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await fetch(apiUrl(request.path), { method: "POST", headers: {
        "Content-Type": "application/json", Authorization: `Bearer ${token}`,
      }, body: JSON.stringify(request.body), signal: controller.signal });
      if (!result.ok) throw new ApiError(`Notification reply failed [${result.status}]`, result.status);
      const response = await result.json() as { success: boolean; data?: { id?: unknown; conversationId?: unknown; senderId?: unknown; repliedToId?: unknown } };
      const message = response?.data;
      if (response?.success !== true || !isPushUuid(message?.id) || message.conversationId !== record.conversationId ||
        message.senderId !== record.recipientUserId || message.repliedToId !== record.messageId)
        throw new Error("Invalid notification reply acknowledgement");
    } finally { clearTimeout(timer); }
  }
}
