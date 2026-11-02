import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import type * as Notifications from "expo-notifications";
import type { AndroidPushDeviceToken } from "./PushTokenCoordinator";
import { isPushUuid } from "./PushInstallation";

export const MESSAGE_CHANNEL_ID = "messages";
export type NotificationModule = typeof Notifications;
export type NativeNotification = Notifications.Notification;
export type NativeResponse = Notifications.NotificationResponse;
export interface PushCapability { available: boolean; explanation?: string }
let loadedModule: NotificationModule | null | undefined;
export function notificationModule(): NotificationModule | null {
  if (loadedModule !== undefined) return loadedModule;
  if ((Platform.OS !== "android" && Platform.OS !== "ios") || Constants.executionEnvironment === "storeClient") return loadedModule = null;
  try {
    // Keep Expo Go / an old binary without this native module usable for chat.
    // A new EAS development/production binary is required for real push.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional native load keeps Expo Go and old binaries usable
    loadedModule = require("expo-notifications") as NotificationModule;
  } catch { loadedModule = null; }
  return loadedModule;
}
const silentForeground = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
/** Run at module initialization, before auth/storage/network startup. Native
 * background/terminated alerts are sent by the server, never socket-scheduled. */
export function installForegroundHandler() {
  notificationModule()?.setNotificationHandler({ handleNotification: async () => silentForeground });
}
export function pushCapability(): PushCapability {
  if (Platform.OS !== "android") return { available: false, explanation: "This server release supports system message push on Android only." };
  if (!notificationModule()) return { available: false, explanation: "Push notifications require a new EAS development or production build, not Expo Go." };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the new device module may be absent in an old development binary
    const device = require("expo-device") as typeof import("expo-device");
    if (!device.isDevice) return { available: false, explanation: "Test push notifications on a physical device." };
  } catch { return { available: false, explanation: "Rebuild the EAS development/production app to include native push dependencies." }; }
  const id = easPushProjectId();
  return typeof id === "string" && id ? { available: true }
    : { available: false, explanation: "The EAS project ID is missing from this build." };
}
export async function ensureMessageChannel() {
  const notifications = notificationModule();
  if (notifications && Platform.OS === "android") await notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: "Messages", description: "Private and group messages", importance: notifications.AndroidImportance.HIGH,
    // SDK 56 treats sound strings as bundled custom resources. Omit the key
    // for Android’s system default; null would silence this channel.
    vibrationPattern: [0, 180, 100, 180], lightColor: "#6C5CE7", enableVibrate: true,
    lockscreenVisibility: notifications.AndroidNotificationVisibility.PRIVATE,
  });
}
export async function readPushPermission(request = false) {
  const capability = pushCapability();
  if (!capability.available) throw new Error(capability.explanation);
  await ensureMessageChannel(); // Android 13: create a channel before requesting POST_NOTIFICATIONS.
  if (Platform.OS === "android" && process.env.EXPO_PUBLIC_ANDROID_NOTIFICATION_ACTIONS === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- only load the opt-in task in a matching native build
    const actions = require("./AndroidMessageActions") as typeof import("./AndroidMessageActions");
    await actions.prepareAndroidMessageActions();
  }
  const notifications = notificationModule()!;
  let permission = await notifications.getPermissionsAsync();
  if (request && !permission.granted && permission.canAskAgain)
    permission = await notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  return permission;
}
export async function getAndroidPushDeviceToken(): Promise<AndroidPushDeviceToken> {
  const token = await notificationModule()!.getDevicePushTokenAsync();
  if (token.type !== "android" || typeof token.data !== "string" || !token.data)
    throw new Error("The native Android push token is unavailable");
  return { type: "android", data: token.data };
}
export async function getMessagePushToken(devicePushToken?: AndroidPushDeviceToken) {
  const projectId = easPushProjectId() ?? undefined;
  return (await notificationModule()!.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) })).data;
}
export function openNotificationSettings() { return Linking.openSettings(); }

/** SDK 56 already exposes the native UUID generator through Expo Modules Core.
 * Do not add another native library just to generate an installation identifier. */
export function nativePushDeviceId() {
  const runtime = globalThis as typeof globalThis & { expo?: { uuidv4?: () => string } };
  if (!runtime.expo?.uuidv4) throw new Error("Rebuild the native app to enable installation identity");
  return runtime.expo.uuidv4();
}
function secureStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- load only for an Android native push operation
  return require("expo-secure-store") as typeof import("expo-secure-store");
}
export const nativePushStorage = {
  getItem: (key: string) => secureStore().getItemAsync(key),
  setItem: (key: string, value: string) => secureStore().setItemAsync(key, value),
};
export function easPushProjectId(): string | null {
  const value = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  return typeof value === "string" ? value : null;
}

/** Public project identifiers only; never display an arbitrary config value
 * that could accidentally contain a credential instead of a UUID. */
export function pushProjectInfo() {
  const safeId = (value: unknown) => isPushUuid(value) ? value.toLowerCase() : null;
  const runtimeProjectId = safeId(Constants.easConfig?.projectId);
  const configuredProjectId = safeId(Constants.expoConfig?.extra?.eas?.projectId);
  return { runtimeProjectId, configuredProjectId, usedProjectId: safeId(easPushProjectId()),
    mismatch: !!runtimeProjectId && !!configuredProjectId && runtimeProjectId !== configuredProjectId };
}
