import { router } from "expo-router";
import { AppState } from "react-native";
import { getAccessToken } from "../api";
import { mediaService } from "../MediaService";
import { socketReceiver } from "../SocketReceiver";
import { messageStore } from "../../db/MessageStore";
import { roomStore } from "../../db/RoomStore";
import { showAppDialog } from "../AppDialogService";
import { ConversationDirectory } from "./ConversationDirectory";
import { MessageNotificationCoordinator } from "./MessageNotificationCoordinator";
import { PushTokenCoordinator } from "./PushTokenCoordinator";
import { registerPushLogout } from "./PushLogout";
import { MessagePushBridge, type MessagePushTarget, type PushEnvelope } from "./MessagePushBridge";
import type { PushRegistration } from "./PushTokenCoordinator";
import type { NativeResponse } from "./NativeMessageNotifications";
import { getMessagePushToken, notificationModule, pushCapability, readPushPermission } from "./NativeMessageNotifications";

const directory = new ConversationDirectory(getAccessToken);
export const messageNotifications = new MessageNotificationCoordinator({
  socket: socketReceiver,
  getRoom: (id, fresh) => directory.get(id, fresh),
  setAccount: id => directory.setAccount(id),
  navigate: room => router.push({ pathname: "/(chatRoom)/privateRoom", params: {
    conversationId: room.conversationId, roomId: room.id, isGroup: room.isGroup ? "true" : "false",
    receiverName: room.name, receiverUsername: room.receiverUsername ?? "", receiverAvatar: room.avatarUrl,
    receiverId: room.isGroup ? "" : room.receiverId ?? "",
  } }),
  unavailable: (message, retry) => showAppDialog({ title: "Conversation unavailable", message,
    buttons: retry ? [{ key: "cancel", label: "Not now", cancel: true }, { key: "retry", label: "Try again", onPress: retry }] : undefined }),
});
export const messagePush = new PushTokenCoordinator({
  capability: pushCapability, permission: readPushPermission, token: getMessagePushToken,
  unregister: async () => { if (pushCapability().available) await notificationModule()!.unregisterForNotificationsAsync(); },
}, null); // Deliberately no guessed HTTP adapter: see the backend contract handoff.

export interface MessagePushBackend extends PushRegistration {
  parseMessage(data: unknown): MessagePushTarget | null;
}
let pushBackend: MessagePushBackend | null = null;
/** Installed only from a real source-verified HTTP/payload adapter. */
export function configureMessagePushBackend(backend: MessagePushBackend) {
  pushBackend = backend; messagePush.setBackend(backend);
}
function startPushBridge() {
  const native = notificationModule();
  if (!native) return () => {};
  const envelope = (response: NativeResponse): PushEnvelope => ({ id: response.notification.request.identifier,
    action: response.actionIdentifier === native.DEFAULT_ACTION_IDENTIFIER ? "default" : response.actionIdentifier,
    data: response.notification.request.content.data });
  const bridge = new MessagePushBridge({
    onResponse: listener => { const subscription = native.addNotificationResponseReceivedListener(value => listener(envelope(value))); return () => subscription.remove(); },
    onReceived: listener => { const subscription = native.addNotificationReceivedListener(value => listener(value.request.content.data)); return () => subscription.remove(); },
    lastResponse: () => { const value = native.getLastNotificationResponse(); return value ? envelope(value) : null; },
    clearResponse: id => {
      // A slow first tap must not erase a newer tap that arrived during REST/auth.
      if (native.getLastNotificationResponse()?.notification.request.identifier === id) native.clearLastNotificationResponse();
      void native.dismissNotificationAsync(id).catch(() => {});
    },
  }, data => pushBackend?.parseMessage(data) ?? null,
  (target, consumed, failed) => messageNotifications.openConversation(target.conversationId, target.accountId, consumed, failed),
  target => {
    if (!messageNotifications.acceptsForeground(target.accountId)) return;
    const version = mediaService.message.sessionVersion;
    void (async () => {
      // A delayed foreground push for an already persisted socket/history message
      // is not a new arrival. No synthetic row or second unread increment.
      if (await messageStore.getByServerId(target.messageId)) return;
      await mediaService.message.syncLatest(target.conversationId, target.accountId);
      roomStore.requestSync();
      if (version !== mediaService.message.sessionVersion || !messageNotifications.acceptsForeground(target.accountId)) return;
      const row = await messageStore.getByServerId(target.messageId);
      if (row?.conversationId === target.conversationId) messageNotifications.receive(row);
    })().catch(() => {});
  });
  bridge.start(); return () => bridge.stop();
}

/** One set of facade/store listeners. Does not create, connect or disconnect a socket. */
export function startMessageNotifications() {
  messageNotifications.start();
  const logout = registerPushLogout(async () => {
    messageNotifications.prepareLogout();
    try { await messagePush.deactivate(); }
    finally {
      const native = notificationModule();
      native?.clearLastNotificationResponse();
      await native?.dismissAllNotificationsAsync().catch(() => {});
    }
  });
  const pushBridge = startPushBridge();
  const preferences = roomStore.subscribePreferences(id => {
    directory.invalidate(id); void messageNotifications.refreshPreference(id);
  });
  const messages = messageStore.subscribe(change => {
    if (change.type === "clear") {
      if (change.conversationId) { directory.invalidate(change.conversationId); messageNotifications.banners.removeConversation(change.conversationId); }
      else messageNotifications.banners.clear(true);
    } else if (change.type === "invalidate") messageNotifications.banners.removeMessage(change.messageId);
    else for (const row of change.rows) if (row.deletedAt) messageNotifications.banners.removeMessage(row.id!);
  });
  const reconnect = socketReceiver.on("connect", () => { if (AppState.currentState === "active") void messagePush.refresh(); });
  return () => { logout(); pushBridge(); preferences(); messages(); reconnect(); messageNotifications.stop(); messagePush.stop(); };
}
