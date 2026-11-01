import { useLayoutEffect } from "react";
import { AppState } from "react-native";
import { useStore } from "react-redux";
import type { RootState } from "@/store";
import { useAppSelector } from "@/store/hooks";
import { mediaService } from "@/services/MediaService";
import { notificationApi } from "@/services/NotificationService";
import { NotificationsController, type NotificationStore } from "@/services/NotificationsController";

const controllers = new WeakMap<NotificationStore, NotificationsController>();
export function useActivityController(): NotificationsController {
  const store = useStore<RootState>();
  let controller = controllers.get(store);
  if (!controller) {
    controller = new NotificationsController(store, notificationApi, {
      on: (event, callback) => mediaService.socket.on(event, callback),
      isConnected: () => mediaService.socket.socket?.connected === true,
    }, AppState);
    controllers.set(store, controller);
  }
  return controller;
}

/** Mounted once by the existing authenticated SocketProvider, not per screen.
 * Layout subscription is ready before first-screen passive focus/socket effects.
 * Token refresh uses the current Redux/API identity without clearing Activity. */
export function useNotificationSync(): void {
  const controller = useActivityController();
  const accountId = useAppSelector(state => state.auth.user?.id);
  const ready = useAppSelector(state => state.auth.isAuthenticated && !!state.auth.token);
  const session = useAppSelector(state => state.notifications.session);
  useLayoutEffect(() => {
    if (ready && accountId) return controller.start(accountId);
    controller.stop();
  }, [controller, accountId, ready, session]);
}
