import { useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { messagePush } from "@/services/notifications/MessageNotifications";
import { openNotificationSettings } from "@/services/notifications/NativeMessageNotifications";
import { COLORS } from "@/constants/theme";
import { useAppSelector } from "@/store/hooks";
export default function PushNotificationSettings() {
  const status = useSyncExternalStore(messagePush.subscribe, messagePush.getSnapshot, messagePush.getSnapshot);
  const enabled = useAppSelector(state => state.app.notificationsEnabled);
  return <View style={styles.container}>
    <Text style={styles.title}>System message notifications</Text>
    <Text accessibilityLiveRegion="polite" style={styles.detail}>{status.detail}</Text>
    {enabled && status.state !== "unsupported" && status.state !== "syncing" && status.state !== "backend-required" ?
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
        if (status.state === "denied") void openNotificationSettings();
        else void messagePush.refresh(true);
      }}><Text style={styles.label}>{status.state === "denied" ? "Open system settings" : status.state === "ready" ? "Check notification setup" : "Enable / retry system notifications"}</Text></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderGray },
  title: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" }, detail: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
  button: { alignSelf: "flex-start", paddingVertical: 10 }, label: { color: COLORS.primary, fontSize: 13, fontWeight: "600" } });
