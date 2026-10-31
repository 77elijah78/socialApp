import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  COLORS,
  SPACING,
  LAYOUT,
  TYPOGRAPHY,
  BORDER_RADIUS,
} from "@/constants/theme";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { clearActivity } from "@/store/slices/notificationsSlice";
import { mediaService } from "@/services/MediaService";
import {
  activityTarget,
  type LiveActivity,
  type LiveActivityType,
} from "@/services/NotificationService";

const ICONS: Record<LiveActivityType, keyof typeof Ionicons.glyphMap> = {
  LIKE: "heart-outline",
  COMMENT: "chatbubble-outline",
  FOLLOW: "person-add-outline",
  MESSAGE: "mail-outline",
  MENTION: "at-outline",
  SHARE: "share-outline",
};
const EMPTY: LiveActivity[] = [];

export default function NotificationsScreen() {
  const accountId = useAppSelector((state) => state.auth.user?.id);
  const activity = useAppSelector((state) => state.notifications);
  const items = activity.accountId === accountId ? activity.items : EMPTY;
  const dispatch = useAppDispatch();
  const [connected, setConnected] = useState(
    mediaService.socket.socket?.connected === true,
  );
  useEffect(() => {
    const on = mediaService.socket.on("connect", () => setConnected(true));
    const off = mediaService.socket.on("disconnect", () => setConnected(false));
    return () => {
      on();
      off();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR COMMUNITY</Text>
          <Text style={styles.title}>Activity</Text>
        </View>
        {items.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => dispatch(clearActivity())}
          >
            <Text style={styles.link}>Clear session</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.capabilities}>
        <Text style={styles.status}>
          {connected
            ? "Live updates · this session"
            : "Live updates disconnected"}
        </Text>
        <Text style={styles.subtitle}>
          This server does not yet provide activity history, actor profiles or
          read status. Times below are when updates reached this device, not
          when the activity happened. Likes, comments and follows may not arrive
          live on the current server.
        </Text>
        {!connected ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => mediaService.socket.socket?.connect()}
          >
            <Text style={styles.link}>Reconnect</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.clientKey}
        contentContainerStyle={items.length ? styles.list : styles.emptyList}
        renderItem={({ item }) => {
          const target = activityTarget(item);
          return (
            <Pressable
              disabled={!target}
              accessibilityRole={target ? "button" : undefined}
              onPress={() => {
                if (target)
                  router.push(target as Parameters<typeof router.push>[0]);
              }}
              style={styles.item}
            >
              <View style={styles.icon}>
                <Ionicons
                  name={ICONS[item.type]}
                  size={22}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.copy}>
                <Text style={styles.content}>{item.content}</Text>
                <Text style={styles.subtitle}>
                  Received {new Date(item.receivedAt).toLocaleString()}
                </Text>
                {item.occurrences > 1 ? (
                  <Text style={styles.subtitle}>
                    {item.occurrences} matching updates received; the server
                    supplies no event ID.
                  </Text>
                ) : null}
              </View>
              {target ? (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.textMuted}
                />
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="notifications-outline"
              size={44}
              color={COLORS.primary}
            />
            <Text style={styles.emptyTitle}>No live updates received</Text>
            <Text style={styles.subtitle}>
              This is not your full activity history. Earlier or missed updates
              cannot be recovered until the backend adds a history API.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgLight },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: LAYOUT.contentPadding,
    backgroundColor: COLORS.bgWhite,
  },
  eyebrow: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
  },
  title: { fontSize: 27, fontWeight: "700", color: COLORS.textPrimary },
  capabilities: {
    margin: LAYOUT.contentPadding,
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primaryGhost,
  },
  status: { color: COLORS.primaryDark, fontSize: 14, fontWeight: "600" },
  subtitle: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  link: { color: COLORS.primary, paddingVertical: SPACING.sm, fontSize: 13 },
  list: {
    paddingHorizontal: LAYOUT.contentPadding,
    paddingBottom: SPACING.xxxxxl,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
    padding: LAYOUT.contentPadding,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderDivider,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
  },
  copy: { flex: 1, gap: SPACING.xs },
  content: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 21 },
  empty: { alignItems: "center", gap: SPACING.md },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "600" },
});
