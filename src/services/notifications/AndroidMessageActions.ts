import { AppState, Platform } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { API_ORIGIN } from "../../config/api";
import { store, persistor } from "../../store";
import { ApiError } from "../api";
import { decodeAndroidMessagePushV2, decodeAndroidMessageTask } from "./AndroidMessagePushV2";
import { PushInstallation, isPushUuid } from "./PushInstallation";
import { nativePushDeviceId, nativePushStorage } from "./NativeMessageNotifications";
import { alreadyDisplayed, markDisplayed, pendingReplies, persistReply, finishReply, clearReplyAccount, replyAccountBlocked, unblockReplyAccount } from "./ReplyActionStore";
import { NotificationReplyTransport } from "./NotificationReplyTransport";
import type { NotificationReplyRecord } from "./NotificationReplyContract";

export const ACTION_TASK = "SOCIAL_MESSAGE_ACTIONS_V2";
export const ACTION_CATEGORY = "MESSAGE_REPLY_V2";
export const REPLY_ACTION = "REPLY_MESSAGE_V2";
export const androidActionsEnabled = () => Platform.OS === "android" && process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS === "1";
const transport = new NotificationReplyTransport();

async function installation() {
  // Do not use a long-lived cached owner: a headless task can race logout.
  return new PushInstallation(nativePushStorage, nativePushDeviceId).load();
}
async function bootstrap() {
  if (persistor.getState().bootstrapped) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => { unsubscribe(); resolve(); }, 5000);
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) { clearTimeout(timer); unsubscribe(); resolve(); }
    });
  });
}
async function owned(account: string, device: string) {
  const current = await installation();
  return !!API_ORIGIN && current.origin === API_ORIGIN && current.deviceId === device && current.registeredOwnerId === account && !await replyAccountBlocked(account);
}
async function retry(account: string, device: string): Promise<"sent" | "pending" | "failed"> {
  if (!API_ORIGIN || !await owned(account, device)) return "pending";
  await bootstrap();
  const actions = await pendingReplies(account, device, API_ORIGIN);
  for (const record of actions) {
    const auth = store.getState().auth;
    if (!auth.isAuthenticated || auth.user?.id !== account || !auth.token || !await owned(account, device)) return "pending";
    try {
      await transport.send(record, auth.token);
      await finishReply(record, "sent");
      await Notifications.dismissNotificationAsync(record.notificationId).catch(() => {});
    } catch (error) {
      if (error instanceof ApiError && [400, 403, 409, 410].includes(error.status)) {
        await finishReply(record, "failed");
        return "failed";
      }
      // A transient or ambiguous failure stays pending with exactly the same ID.
      return "pending";
    }
  }
  return "sent";
}
export async function retryAndroidNotificationReplies() {
  if (!androidActionsEnabled()) return;
  const current = await installation();
  if (current.registeredOwnerId) await retry(current.registeredOwnerId, current.deviceId);
}
export async function clearAndroidNotificationActions(account: string) {
  if (androidActionsEnabled()) await clearReplyAccount(account);
}
export async function enableAndroidNotificationActions(account: string) {
  if (androidActionsEnabled()) await unblockReplyAccount(account);
}
async function handleResponse(value: Record<string, unknown>) {
  if (value.actionIdentifier !== REPLY_ACTION || typeof value.userText !== "string") return;
  const notification = value.notification as { request?: { content?: { data?: unknown; dataString?: unknown } } } | undefined;
  const content = notification?.request?.content;
  let raw = content?.data;
  // Android task callbacks contain the native serializer's dataString; unlike
  // Expo's foreground listener, TaskManager does not run mapNotificationResponse.
  if (!raw && typeof content?.dataString === "string" && content.dataString.length <= 32768) {
    try { raw = JSON.parse(content.dataString); } catch { return; }
  }
  const push = decodeAndroidMessagePushV2(raw);
  const actionId = raw && typeof raw === "object" ? (raw as Record<string, unknown>).replyActionId : null;
  if (!push || !isPushUuid(actionId) || !await owned(push.recipientUserId, push.deviceId) || !API_ORIGIN) return;
  const record: NotificationReplyRecord = { actionId, recipientUserId: push.recipientUserId, deviceId: push.deviceId,
    notificationId: push.notificationId, conversationId: push.conversationId, messageId: push.messageId, content: value.userText };
  await persistReply(record, API_ORIGIN); // durable before first network request
  const outcome = await retry(push.recipientUserId, push.deviceId);
  if (outcome !== "sent") await Notifications.scheduleNotificationAsync({ content: { title: "Message reply",
    body: outcome === "failed" ? "Reply could not be sent. Open the conversation to try again." : "Reply pending. Open the app to retry safely." },
    trigger: { channelId: "messages" } }).catch(() => {});
}
async function handleData(value: unknown) {
  const push = decodeAndroidMessageTask(value);
  if (!push || !await owned(push.recipientUserId, push.deviceId) || await alreadyDisplayed(push.recipientUserId, push.notificationId)) return;
  await Notifications.scheduleNotificationAsync({ identifier: push.notificationId, content: {
    title: push.display.title, body: push.display.body, categoryIdentifier: ACTION_CATEGORY, data: { ...push },
    sound: "default",
  }, trigger: { channelId: "messages" } });
  await markDisplayed(push.recipientUserId, push.notificationId);
}
if (androidActionsEnabled() && !TaskManager.isTaskDefined(ACTION_TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(ACTION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    try {
      if ("actionIdentifier" in data) await handleResponse(data as unknown as Record<string, unknown>);
      else await handleData(data);
    } catch {
      // Do not log payload, reply text or credentials. A stored reply remains
      // pending and is retried when this account next opens the app.
      if (AppState.currentState !== "active") await Notifications.scheduleNotificationAsync({ content: {
        title: "Message reply", body: "Open the app to check your message reply.",
      }, trigger: { channelId: "messages" } }).catch(() => {});
    }
  });
}
export async function prepareAndroidMessageActions() {
  if (!androidActionsEnabled()) return;
  await Notifications.setNotificationCategoryAsync(ACTION_CATEGORY, [{ identifier: REPLY_ACTION, buttonTitle: "Reply",
    textInput: { submitButtonTitle: "Send", placeholder: "Type a reply" }, options: { opensAppToForeground: false } }]);
  await Notifications.registerTaskAsync(ACTION_TASK);
}
