import { router } from "expo-router";
import { AppState } from "react-native";
import { store } from "../../store";
import { getAccessToken } from "../api";
import { mediaService } from "../MediaService";
import { socketReceiver } from "../SocketReceiver";
import { messageStore } from "../../db/MessageStore";
import { roomStore } from "../../db/RoomStore";
import { showAppDialog } from "../AppDialogService";
import { ConversationDirectory } from "./ConversationDirectory";
import { MessageNotificationCoordinator } from "./MessageNotificationCoordinator";
import { PushTokenCoordinator, type PushIdentity } from "./PushTokenCoordinator";
import { registerPushLogout } from "./PushLogout";
import { MessagePushBridge, type PushEnvelope } from "./MessagePushBridge";
import { PushBackendService, PushAccountAmbiguous } from "./PushBackendService";
import { PushInstallation } from "./PushInstallation";
import { PushPreferencesController } from "./PushPreferencesController";
import { PushVisibilityCoordinator } from "./PushVisibilityCoordinator";
import { getAndroidPushDeviceToken, getMessagePushToken, notificationModule, pushCapability, readPushPermission,
  nativePushStorage, nativePushDeviceId, easPushProjectId, type NativeResponse } from "./NativeMessageNotifications";

function currentIdentity(): PushIdentity | null {
  const auth = store.getState().auth, authToken = getAccessToken();
  return auth.isAuthenticated && auth.user?.id && authToken ? { accountId: auth.user.id, authToken } : null;
}
const directory = new ConversationDirectory(getAccessToken);
export const pushInstallation = new PushInstallation(nativePushStorage, nativePushDeviceId);
export const pushBackend = new PushBackendService(pushInstallation, easPushProjectId, currentIdentity);
export const pushPreferences = new PushPreferencesController(pushBackend);
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
  capability: pushCapability, permission: readPushPermission, deviceToken: getAndroidPushDeviceToken, token: getMessagePushToken,
  unregister: async () => {
    if (pushCapability().available) {
      const native = notificationModule()!;
      try { await native.setAutoServerRegistrationEnabledAsync(false); }
      finally { await native.unregisterForNotificationsAsync(); }
    }
  },
}, pushBackend);
export const pushVisibility = new PushVisibilityCoordinator({
  connected: () => socketReceiver.isConnected,
  send: scope => {
    if (scope.deviceId) socketReceiver.setConversationVisibility(scope.accountId, scope.deviceId, scope.active, scope.conversationId);
  },
});
export interface MessageNotificationScope {
  accountId: string; enabled: boolean; active: boolean; conversationId: string | null; ready: boolean;
  visibleConversationId: string | null;
}
let scope: MessageNotificationScope = { accountId: "", enabled: false, active: false, conversationId: null, ready: false, visibleConversationId: null };
function updateVisibility(force = false) {
  const registration = pushBackend.registration();
  const eligible = scope.active && scope.enabled && scope.ready && messageNotifications.acceptsForeground(scope.accountId);
  pushVisibility.update({ accountId: scope.accountId, deviceId: registration?.accountId === scope.accountId ? registration.deviceId : null,
    active: eligible,
    conversationId: eligible ? scope.visibleConversationId : null }, force);
}
export function updateMessageNotificationScope(next: MessageNotificationScope) {
  scope = next;
  messageNotifications.update(next);
  const identity = currentIdentity();
  messagePush.update(identity, next.enabled);
  pushPreferences.update(identity);
  updateVisibility();
}
function recoverMessages() {
  roomStore.requestSync();
  if (socketReceiver.isConnected) void socketReceiver.syncPendingDelivery().catch(() => {});
  if (scope.accountId && scope.ready && scope.active && scope.conversationId)
    void mediaService.message.syncLatest(scope.conversationId, scope.accountId).catch(() => {});
}
export function refreshMessagePush() {
  void messagePush.refresh(); void pushPreferences.refresh(); recoverMessages();
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
      if (native.getLastNotificationResponse()?.notification.request.identifier === id) native.clearLastNotificationResponse();
      void native.dismissNotificationAsync(id).catch(() => {});
    },
  }, data => pushBackend.parseMessage(data),
  (target, consumed, failed) => messageNotifications.openConversation(target.conversationId, target.accountId, consumed, failed),
  target => {
    if (!messageNotifications.acceptsForeground(target.accountId)) return;
    const version = mediaService.message.sessionVersion;
    void (async () => {
      if (await messageStore.getByServerId(target.messageId)) return;
      await mediaService.message.syncLatest(target.conversationId, target.accountId);
      roomStore.requestSync();
      if (version !== mediaService.message.sessionVersion || !messageNotifications.acceptsForeground(target.accountId)) return;
      const row = await messageStore.getByServerId(target.messageId);
      if (row?.conversationId === target.conversationId) messageNotifications.receive(row);
    })().catch(() => {});
  }, (error, consumed) => {
    if (error instanceof PushAccountAmbiguous)
      messageNotifications.noticeWhenReady("This server’s push links cannot safely identify the receiving account after an account change. Open Messages to view your current conversations.", consumed);
    // Storage/network failures keep the native last response for a later retry.
  });
  bridge.start(); return () => bridge.stop();
}

/** One set of shared facade/store/native listeners; never owns a second socket. */
export function startMessageNotifications() {
  messageNotifications.start();
  const logout = registerPushLogout(async nextAccountId => {
    if (nextAccountId && nextAccountId === messageNotifications.getAccountId()) return;
    scope = { ...scope, enabled: false, ready: false, visibleConversationId: null };
    pushVisibility.stop(); messageNotifications.prepareLogout();
    try { await messagePush.deactivate(); }
    finally {
      const native = notificationModule(); native?.clearLastNotificationResponse();
      await native?.dismissAllNotificationsAsync().catch(() => {});
    }
  });
  const bridge = startPushBridge();
  const preferences = roomStore.subscribePreferences(id => { directory.invalidate(id); void messageNotifications.refreshPreference(id); });
  const installation = pushInstallation.subscribe(() => updateVisibility());
  const registration = messagePush.subscribe(() => updateVisibility());
  const messages = messageStore.subscribe(change => {
    if (change.type === "clear") {
      if (change.conversationId) { directory.invalidate(change.conversationId); messageNotifications.banners.removeConversation(change.conversationId); }
      else messageNotifications.banners.clear(true);
    } else if (change.type === "invalidate") messageNotifications.banners.removeMessage(change.messageId);
    else for (const row of change.rows) if (row.deletedAt) messageNotifications.banners.removeMessage(row.id!);
  });
  const reconnect = socketReceiver.on("connect", () => {
    updateVisibility(true);
    if (AppState.currentState === "active") { void messagePush.refresh(); void pushPreferences.refresh(); }
  });
  const disconnect = socketReceiver.on("disconnect", () => pushVisibility.disconnect());
  const resync = socketReceiver.on("messages:sync", () => { if (AppState.currentState === "active") recoverMessages(); });
  return () => { logout(); bridge(); preferences(); installation(); registration(); messages(); reconnect(); disconnect(); resync();
    pushVisibility.stop(); messageNotifications.stop(); messagePush.stop(); };
}
