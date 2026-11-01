import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useGlobalSearchParams, useRootNavigationState, useSegments } from "expo-router";
import { useAppSelector } from "@/store/hooks";
import { messageNotifications, messagePush, startMessageNotifications } from "@/services/notifications/MessageNotifications";
import { installForegroundHandler, notificationModule } from "@/services/notifications/NativeMessageNotifications";
import MessageBanner from "./MessageBanner";
import { roomStore } from "@/db/RoomStore";
import { socketReceiver } from "@/services/SocketReceiver";

installForegroundHandler();
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : null;
export default function MessageNotificationsHost() {
  const accountId = useAppSelector(state => state.auth.isAuthenticated ? state.auth.user?.id ?? "" : "");
  const token = useAppSelector(state => state.auth.token);
  const enabled = useAppSelector(state => state.app.notificationsEnabled);
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ conversationId?: string | string[] }>();
  const navigation = useRootNavigationState();
  const conversationId = segments.includes("(chatRoom)") && segments.at(-1) === "privateRoom" ? one(params.conversationId) : null;
  const ready = !!navigation?.key && segments.length > 0 && segments[0] !== "index" && !segments.includes("(auth)") && !!accountId && !!token;
  const banner = useSyncExternalStore(messageNotifications.banners.subscribe, messageNotifications.banners.getSnapshot, () => null);
  useEffect(() => startMessageNotifications(), []);
  useEffect(() => {
    const update = () => messageNotifications.update({ accountId, enabled, active: AppState.currentState === "active", conversationId, ready });
    update();
    let previous = AppState.currentState;
    const lifecycle = AppState.addEventListener("change", state => {
      update();
      if (state === "active" && previous !== "active") {
        void messagePush.refresh(); roomStore.requestSync();
        if (socketReceiver.isConnected) void socketReceiver.syncPendingDelivery().catch(() => {});
      }
      previous = state;
    });
    return () => lifecycle.remove();
  }, [accountId, enabled, conversationId, ready]);
  useEffect(() => { messagePush.update(accountId && token ? { accountId, authToken: token } : null, enabled); }, [accountId, token, enabled]);
  useEffect(() => {
    const native = notificationModule();
    if (!native) return;
    // Always reacquire the Expo token after native FCM/APNs rotation. Never POST
    // the native device token to an Expo-token backend.
    const tokenChange = native.addPushTokenListener(() => { void messagePush.refresh(); });
    return () => tokenChange.remove();
  }, []);
  return banner && accountId === messageNotifications.getAccountId() && enabled && banner.conversationId !== conversationId ? <MessageBanner key={banner.key} banner={banner} onDismiss={messageNotifications.banners.dismiss}
    onOpen={id => messageNotifications.openConversation(id, accountId)} /> : null;
}
