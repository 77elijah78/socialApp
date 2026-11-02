import { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { messagePush, pushPreferences, pushInstallation } from "@/services/notifications/MessageNotifications";
import { openNotificationSettings, pushProjectInfo } from "@/services/notifications/NativeMessageNotifications";
import { COLORS } from "@/constants/theme";
import { useAppSelector } from "@/store/hooks";
export default function PushNotificationSettings() {
  const status = useSyncExternalStore(messagePush.subscribe, messagePush.getSnapshot, messagePush.getSnapshot);
  const preferences = useSyncExternalStore(pushPreferences.subscribe, pushPreferences.getSnapshot, pushPreferences.getSnapshot);
  const installation = useSyncExternalStore(pushInstallation.subscribe, pushInstallation.peek, () => null);
  const enabled = useAppSelector(state => state.app.notificationsEnabled);
  const accountId = useAppSelector(state => state.auth.user?.id);
  const data = preferences.accountId === accountId ? preferences.data : null;
  const project = pushProjectInfo();
  const registeredButOff = status.state === "ready" && data?.messagePushEnabled === false;
  return <View style={styles.container}>
    <Text style={styles.title}>System message notifications</Text>
    <Text selectable accessibilityLiveRegion="polite" style={styles.detail}>{registeredButOff
      ? "This device is registered, but message push is turned off for your account." : status.detail}</Text>
    {status.state === "error" ? <Text testID="push-runtime-project" selectable style={styles.detail}>EAS project used: {project.usedProjectId ?? "unavailable or invalid"}</Text> : null}
    {project.mismatch ? <Text selectable accessibilityRole="alert" style={styles.error}>[EAS_PROJECT_MISMATCH] SDK runtime: {project.runtimeProjectId}. Current source: {project.configuredProjectId}. Check the app/bundle project link before changing IDs.</Text> : null}
    <Text style={styles.detail}>Use a physical Android development or production build. Expo Go cannot receive this app’s remote push notifications.</Text>
    {enabled && status.state !== "unsupported" && status.state !== "syncing" && status.state !== "backend-required" ?
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
        if (status.state === "denied") void openNotificationSettings().catch(() => {});
        else void messagePush.refresh(true);
      }}><Text style={styles.label}>{status.state === "denied" ? "Open system settings" : status.state === "ready" ? "Check notification setup" : "Enable / retry system notifications"}</Text></Pressable> : null}
    {data ? <>
      <View style={styles.row}><View style={styles.copy}>
        <Text style={styles.title}>Message push on all devices</Text><Text style={styles.detail}>Account-wide system notifications. The main switch above controls this device’s banners and registration.</Text>
      </View><Switch accessibilityLabel="Message push on all devices" value={data.messagePushEnabled} disabled={preferences.saving}
        onValueChange={value => { void pushPreferences.change({ messagePushEnabled: value }); }} trackColor={{ false: COLORS.borderGray, true: COLORS.primaryLight }} /></View>
      <View style={styles.row}><View style={styles.copy}>
        <Text style={styles.title}>Show message previews</Text><Text style={styles.detail}>Allow sender names and message previews on notification and lock screens.</Text>
      </View><Switch accessibilityLabel="Show message previews" value={data.pushPreviewsEnabled} disabled={preferences.saving}
        onValueChange={value => { void pushPreferences.change({ pushPreviewsEnabled: value }); }} trackColor={{ false: COLORS.borderGray, true: COLORS.primaryLight }} /></View>
    </> : null}
    {preferences.accountId === accountId && preferences.error ? <>
      <Text accessibilityRole="alert" style={styles.error}>{preferences.error}</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => { void pushPreferences.refresh(); }}><Text style={styles.label}>Retry account preferences</Text></Pressable>
    </> : null}
    {installation?.ambiguous ? <Text style={styles.detail}>This backend needs account-scoped push links after account changes. Messages still arrive; open Messages if an old notification cannot safely open a conversation.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderGray },
  title: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" }, detail: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
  button: { alignSelf: "flex-start", paddingVertical: 10 }, label: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }, copy: { flex: 1 }, error: { color: COLORS.danger, fontSize: 12, marginTop: 8 } });
