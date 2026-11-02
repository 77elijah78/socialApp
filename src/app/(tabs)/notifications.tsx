import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { COLORS, LAYOUT, SPACING } from "@/constants/theme";
import { useAppSelector } from "@/store/hooks";
import { emptyNotifications } from "@/store/slices/notificationsSlice";
import { useActivityController } from "@/hooks/useNotifications";
import { activityDestination, type ActivityItem } from "@/services/NotificationService";
import { showAppDialog } from "@/services/AppDialogService";
import ActivityRow from "@/components/notifications/ActivityRow";
import ActivitySkeleton from "@/components/notifications/ActivitySkeleton";

function EmptyActivity({ error, retry }: { error: string | null; retry(): void }) {
  return (
    <View style={styles.empty} accessibilityRole={error ? "alert" : undefined}>
      <View style={styles.emptyIcon}>
        <Ionicons name={error ? "cloud-offline-outline" : "notifications-outline"} size={34} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>{error ? "Couldn’t load activity" : "You’re in the loop"}</Text>
      <Text style={styles.emptyCopy}>{error || "Likes, comments, replies and new followers will find a home here. Keep sharing what makes you, you."}</Text>
      {error ? <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable> : <Text style={styles.emptyHint}>Pull down any time to refresh.</Text>}
    </View>
  );
}
function Separator() { return <View style={styles.separator} />; }

export default function NotificationsScreen() {
  const accountId = useAppSelector(state => state.auth.user?.id);
  const activity = useAppSelector(state => state.notifications.accountId === state.auth.user?.id
    ? state.notifications : emptyNotifications);
  const controller = useActivityController();
  const [now, setNow] = useState(() => Date.now());
  const navigating = useRef(false);
  useFocusEffect(useCallback(() => {
    navigating.current = false;
    if (!accountId) return;
    void controller.open({ accountId, session: activity.session });
    if (!activity.foreground) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [controller, activity.foreground, accountId, activity.session]));

  const readFailure = useCallback((error: Error) => showAppDialog({
    title: "Read status wasn’t saved",
    message: `We couldn’t confirm the update. Your activity will be checked again. ${error.message}`,
    tone: "error",
  }), []);
  const markRead = useCallback((item: ActivityItem) => {
    void controller.markRead(item.id).catch(readFailure);
  }, [controller, readFailure]);
  const openActor = useCallback((item: ActivityItem) => {
    if (!item.actor || navigating.current) return;
    markRead(item);
    navigating.current = true;
    router.push({ pathname: "/user/[username]", params: { username: item.actor.username } });
  }, [markRead]);
  const openItem = useCallback((item: ActivityItem) => {
    if (navigating.current) return;
    markRead(item);
    const destination = activityDestination(item);
    if (!destination) {
      showAppDialog({ title: "Details unavailable", tone: "info",
        message: !item.hydrated ? "We’re syncing this activity. Pull down to refresh and try again."
          : item.type === "FOLLOW" ? "This account is no longer available."
            : item.type === "MENTION" ? "This server doesn’t provide a destination for this mention."
              : "This post may have been removed or is no longer available to you." });
      return;
    }
    navigating.current = true;
    if (destination.kind === "profile") router.push({ pathname: "/user/[username]", params: { username: destination.username } });
    else if (destination.kind === "post") router.push({ pathname: "/posts/[id]", params: { id: destination.postId } });
    else router.push("/(tabs)/messages");
  }, [markRead]);
  const refresh = useCallback(() => { void controller.refresh(); }, [controller]);
  const renderItem = useCallback(({ item }: { item: ActivityItem }) => (
    <ActivityRow item={item} now={now} onOpen={openItem} onActor={openActor} onRead={markRead} />
  ), [now, openItem, openActor, markRead]);
  const initialLoading = !activity.initialized && !activity.error;
  const reading = Object.keys(activity.pendingReads).length > 0;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>YOUR COMMUNITY</Text>
            <Text style={styles.title}>Activity</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Mark all activity as read"
            accessibilityState={{ disabled: !activity.unreadCount || reading, busy: activity.readAllPending }}
            disabled={!activity.unreadCount || reading || !activity.unreadKnown}
            onPress={() => void controller.markAllRead().catch(readFailure)}
            style={({ pressed }) => [styles.readAll, (!activity.unreadCount || reading) && styles.disabled, pressed && styles.pressed]}>
            {activity.readAllPending ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="checkmark-done-outline" size={17} color={COLORS.primary} />}
            <Text style={styles.readAllText}>{activity.readAllPending ? "Saving…" : "Read all"}</Text>
          </Pressable>
        </View>
        <View style={styles.summary}>
          <View style={styles.summaryIcon}><Ionicons name="heart-outline" size={19} color={COLORS.primary} /></View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{activity.unreadCount
              ? `${activity.unreadCount} unread ${activity.unreadCount === 1 ? "update" : "updates"}`
              : activity.unreadKnown ? "You’re all caught up" : "A little closer to your people"}</Text>
            <Text style={styles.summarySubtitle}>Your moments. Their reactions.</Text>
          </View>
          <View style={styles.connection}>
            {activity.syncing ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <View style={[styles.statusDot, { backgroundColor: activity.connected ? COLORS.green : COLORS.textMuted }]} />}
            <Text style={styles.connectionText}>{activity.syncing ? "Syncing" : activity.connected ? "Live" : "Reconnecting"}</Text>
          </View>
        </View>
        <FlatList
          key={accountId ?? "signed-out"}
          data={activity.items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={activity.refreshing} onRefresh={refresh}
            tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          onEndReached={() => { void controller.loadMore(); }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={activity.error && activity.items.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retry activity refresh" onPress={refresh} style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={20} color={COLORS.primaryDark} />
              <Text style={styles.errorCopy}>{activity.error} Tap to retry.</Text>
            </Pressable>
          ) : null}
          ListEmptyComponent={initialLoading ? <ActivitySkeleton /> : <EmptyActivity error={activity.error} retry={refresh} />}
          ListFooterComponent={activity.items.length ? (
            <View style={styles.footer}>
              {activity.paginating ? <ActivityIndicator accessibilityLabel="Loading older activity" color={COLORS.primary} />
                : activity.paginationError ? <Pressable accessibilityRole="button" onPress={() => void controller.loadMore(true)} style={styles.pageButton}>
                  <Text style={styles.errorCopy}>{activity.paginationError}</Text>
                  <Text style={styles.link}>Retry older activity</Text>
                </Pressable>
                  : activity.hasMore ? <Pressable accessibilityRole="button" disabled={activity.syncing || activity.refreshing}
                    onPress={() => void controller.loadMore()} style={styles.pageButton}><Text style={styles.link}>Load older activity</Text></Pressable>
                    : activity.initialized ? <Text style={styles.endCopy}>You’ve seen all your activity</Text> : null}
            </View>
          ) : null}
        />
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  content: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" },
  header: { paddingHorizontal: LAYOUT.contentPadding, paddingTop: SPACING.xl, paddingBottom: SPACING.lg,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  heading: { flexShrink: 1 },
  eyebrow: { fontSize: 10, fontWeight: "600", letterSpacing: 1.5, color: COLORS.textSecondary, marginBottom: 4 },
  title: { fontSize: 31, lineHeight: 38, fontWeight: "700", color: COLORS.textPrimary, letterSpacing: -0.8 },
  readAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 44,
    paddingHorizontal: 12, borderRadius: 15, backgroundColor: COLORS.bgWhite },
  readAllText: { color: COLORS.primaryDark, fontSize: 12, fontWeight: "600" },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.7 },
  summary: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: LAYOUT.contentPadding,
    marginBottom: 18, padding: 12, borderRadius: 17, backgroundColor: COLORS.primaryGhost, flexWrap: "wrap" },
  summaryIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.bgWhite, alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1, minWidth: 125, gap: 3 },
  summaryTitle: { color: COLORS.primaryDark, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  summarySubtitle: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  connection: { flexDirection: "row", alignItems: "center", gap: 4 },
  connectionText: { fontSize: 10, color: COLORS.textSecondary },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  list: { paddingHorizontal: LAYOUT.contentPadding, paddingBottom: SPACING.xxxl, flexGrow: 1 },
  separator: { height: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 52, gap: 14 },
  emptyIcon: { width: 78, height: 78, borderRadius: 28, backgroundColor: COLORS.primaryGhost, justifyContent: "center", alignItems: "center", marginBottom: 5 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 21, fontWeight: "700", textAlign: "center" },
  emptyCopy: { color: COLORS.textSecondary, textAlign: "center", fontSize: 14, lineHeight: 22, maxWidth: 330 },
  emptyHint: { color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginTop: 4 },
  retryButton: { minHeight: 44, backgroundColor: COLORS.primary, paddingHorizontal: 24, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  retryText: { color: COLORS.textOnPrimary, fontSize: 14, fontWeight: "600" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: COLORS.primaryGhost, padding: 12, borderRadius: 14, marginBottom: 12 },
  errorCopy: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 19, flexShrink: 1 },
  footer: { alignItems: "center", paddingVertical: 20, gap: 12 },
  pageButton: { minHeight: 44, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  link: { color: COLORS.primaryDark, fontSize: 13, fontWeight: "600" },
  endCopy: { color: COLORS.textSecondary, fontSize: 11, textAlign: "center" },
});
