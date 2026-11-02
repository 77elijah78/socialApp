import { isPushUuid } from "./PushInstallation";

/** Data-only contract at backend 66cf042. The decoder is deliberately separate
 * from the legacy auto-alert path; never render both for the same push. */
export interface AndroidMessagePushV2 {
  contractVersion: 2; notificationType: "MESSAGE"; deliveryMode: "android-data-v2";
  notificationId: string; recipientUserId: string; deviceId: string; messageId: string;
  conversationId: string; conversationType: "private" | "group"; senderId: string;
  groupKey: string; categoryIdentifier: "MESSAGE_REPLY_V2";
  display: { title: string; body: string; channelId: "messages" };
}
/** The installed Expo Android task serializes FCM's body under dataString.
 * Never interpret an auto-rendered FCM alert as a data-only message. */
export function decodeAndroidMessageTask(value: unknown): AndroidMessagePushV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const task = value as Record<string, unknown>;
  if (task.notification !== null || !task.data || typeof task.data !== "object" || Array.isArray(task.data)) return null;
  const dataString = (task.data as Record<string, unknown>).dataString;
  if (typeof dataString !== "string" || dataString.length > 32768) return null;
  try { return decodeAndroidMessagePushV2(JSON.parse(dataString)); } catch { return null; }
}

export function decodeAndroidMessagePushV2(value: unknown): AndroidMessagePushV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.contractVersion !== 2 || data.notificationType !== "MESSAGE" || data.deliveryMode !== "android-data-v2" ||
    data.categoryIdentifier !== "MESSAGE_REPLY_V2" || !["private", "group"].includes(data.conversationType as string) ||
    ![data.notificationId, data.recipientUserId, data.deviceId, data.messageId, data.conversationId, data.senderId].every(isPushUuid) ||
    data.senderId === data.recipientUserId || data.groupKey !== `socialapp:v2:${data.recipientUserId}:${data.conversationId}`) return null;
  if (!data.display || typeof data.display !== "object" || Array.isArray(data.display)) return null;
  const display = data.display as Record<string, unknown>;
  if (typeof display.title !== "string" || !display.title || display.title.length > 128 ||
    typeof display.body !== "string" || !display.body || display.body.length > 160 || display.channelId !== "messages") return null;
  return { contractVersion: 2, notificationType: "MESSAGE", deliveryMode: "android-data-v2",
    notificationId: data.notificationId as string, recipientUserId: data.recipientUserId as string, deviceId: data.deviceId as string,
    messageId: data.messageId as string, conversationId: data.conversationId as string, conversationType: data.conversationType as "private" | "group",
    senderId: data.senderId as string, groupKey: data.groupKey as string, categoryIdentifier: "MESSAGE_REPLY_V2",
    display: { title: display.title, body: display.body, channelId: "messages" } };
}
