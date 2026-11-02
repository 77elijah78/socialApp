import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";

import PrivateMessageCard from "@/components/messages/PrivateMessageCard";
import { ConversationRowSkeleton, OfflineBanner } from "@/components/ui";
import theme from "@/constants/theme";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useRooms } from "@/hooks/useRooms";
import { mediaService } from "@/services/MediaService";
import { showAppDialog } from "@/services/AppDialogService";
import { useOverlay, type ActionMenuItem } from "@/providers/OverlayProvider";
import { messageStore } from "@/db/MessageStore";
import { useAppSelector } from "@/store/hooks";
import {
  getRecentMessageCache,
  setRecentMessageCache,
} from "@/utils/recentMessageCache";

export default function Messages() {
  const { rooms, loading, error, syncing, reload, deleteRoom } = useRooms();
  const currentUserId = useAppSelector((state) => state.auth.user?.id);
  const { isOffline } = useNetworkStatus();
  const { openActionMenu } = useOverlay();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "unread">("all");

  const handleRetry = useCallback(() => {
    void reload();
  }, [reload]);

  const handleDeleteRoom = useCallback(
    async (
      roomId: string,
      receiverName: string,
      anchor?: { x: number; y: number; width: number; height: number },
    ) => {
      const actions: ActionMenuItem[] = [
        {
          key: "cancel",
          icon: "close-outline",
          label: "Cancel",
          onPress: () => {},
        },
        {
          key: "delete",
          icon: "trash-outline",
          label: `Delete conversation with ${receiverName}`,
          destructive: true,
          onPress: async () => {
            try {
              await mediaService.message.deleteConversation(roomId);
              await deleteRoom(roomId);
            } catch {
              showAppDialog({
                title: "Couldn’t delete conversation",
                message: "Please try again in a moment.",
                tone: "error",
              });
            }
          },
        },
      ];
      openActionMenu(actions, anchor);
    },
    [deleteRoom, openActionMenu],
  );

  const unreadConversationCount = useMemo(
    () => rooms.filter((room) => room.unreadCount > 0).length,
    [rooms],
  );
  const totalUnread = useMemo(
    () =>
      rooms.reduce(
        (total, room) => total + Math.max(0, room.unreadCount ?? 0),
        0,
      ),
    [rooms],
  );

  const filteredRooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rooms.filter((room) => {
      const matchesFilter = activeFilter === "all" || room.unreadCount > 0;
      const matchesSearch =
        !query ||
        (room.name ?? "").toLowerCase().includes(query) ||
        (room.lastMessage ?? "").toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, rooms, searchQuery]);

  const openRoom = useCallback(
    async (item: (typeof rooms)[number]) => {
      // Start the latest-page refresh while the list is still on screen. The
      // room screen joins this same request instead of issuing another one.
      if (currentUserId) {
        void mediaService.message
          .syncLatest(item.conversationId, currentUserId)
          .then(async () => {
            const latest = await messageStore.getRecent(item.conversationId, 30);
            setRecentMessageCache(item.conversationId, latest);
          })
          .catch(() => {});
      }

      const cached = getRecentMessageCache(item.conversationId);
      if (!cached || Date.now() - cached.cachedAt > 750) {
        try {
          const latest = await messageStore.getRecent(item.conversationId, 30);
          setRecentMessageCache(item.conversationId, latest);
        } catch {
          // The room screen can still load from SQLite or synchronize itself.
        }
      }

      router.push({
        pathname: "/(chatRoom)/privateRoom",
        params: {
          conversationId: item.conversationId,
          roomId: item.id,
          isGroup: item.isGroup ? "true" : "false",
          receiverName: item.name,
          receiverUsername: item.receiverUsername ?? "",
          receiverAvatar: item.avatarUrl,
          receiverId: item.receiverId ?? "",
        },
      });
    },
    [currentUserId],
  );

  const skeletonData = useMemo(() => Array.from({ length: 6 }), []);
  const renderSkeleton = useCallback(
    ({ index }: { item: unknown; index: number }) => (
      <ConversationRowSkeleton
        key={`skeleton-${index}`}
        testID="conversation-skeleton"
      />
    ),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    let cancelled = false;
    const preloadVisibleRooms = async () => {
      for (const room of rooms.slice(0, 6)) {
        const cached = getRecentMessageCache(room.conversationId);
        if (cached && Date.now() - cached.cachedAt < 5000) continue;
        try {
          const recent = await messageStore.getRecent(room.conversationId, 30);
          if (cancelled) return;
          setRecentMessageCache(room.conversationId, recent);
        } catch {
          // Preloading is opportunistic; opening the room has its own fallback.
        }
      }
    };
    void preloadVisibleRooms();
    return () => {
      cancelled = true;
    };
  }, [rooms]);

  const renderEmpty = () => {
    const isSearching = searchQuery.trim().length > 0;
    const title = isSearching
      ? "No matches found"
      : activeFilter === "unread"
        ? "You’re all caught up"
        : "Your inbox is waiting";
    const description = isSearching
      ? "Try a different name or message."
      : activeFilter === "unread"
        ? "Unread conversations will show up here."
        : "Start a conversation and it will appear here.";

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconWrap}>
          <Ionicons
            name={isSearching ? "search-outline" : "chatbubbles-outline"}
            size={29}
            color={theme.COLORS.primary}
          />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyDescription}>{description}</Text>
        {isSearching ? (
          <Pressable
            onPress={() => setSearchQuery("")}
            style={styles.emptyAction}
          >
            <Text style={styles.emptyActionText}>Clear search</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <OfflineBanner isOffline={isOffline} onRetry={handleRetry} />

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>YOUR INBOX</Text>
          <Text style={styles.heroTitle}>Messages</Text>
          <Text style={styles.heroSubtitle}>Pick up where you left off.</Text>
        </View>
        <View style={styles.inboxMarkWrap}>
          <LinearGradient
            colors={[theme.COLORS.primary, theme.COLORS.accentPurple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inboxMark}
          >
            <Ionicons
              name="chatbubble-ellipses"
              size={22}
              color={theme.COLORS.white}
            />
          </LinearGradient>
          {totalUnread > 0 ? (
            <View style={styles.inboxUnreadDot}>
              <Text style={styles.inboxUnreadText}>
                {totalUnread > 9 ? "9+" : totalUnread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={19} color={theme.COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people or messages"
          placeholderTextColor={theme.COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setSearchQuery("")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close-circle"
              size={19}
              color={theme.COLORS.textMuted}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{
          maxHeight: 40,
        }}
      >
        <FilterChip
          label="All"
          selected={activeFilter === "all"}
          count={rooms.length}
          onPress={() => setActiveFilter("all")}
        />
        <FilterChip
          label="Unread"
          selected={activeFilter === "unread"}
          count={unreadConversationCount}
          onPress={() => setActiveFilter("unread")}
        />
      </ScrollView>

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>
          {activeFilter === "unread"
            ? "Unread conversations"
            : "Recent conversations"}
        </Text>
        <View style={styles.listMeta}>
          {syncing ? (
            <ActivityIndicator size="small" color={theme.COLORS.primary} />
          ) : null}
          <Text style={styles.listCount}>
            {filteredRooms.length}{" "}
            {filteredRooms.length === 1 ? "chat" : "chats"}
          </Text>
        </View>
      </View>

      {loading && rooms.length === 0 ? (
        <FlatList
          style={styles.list}
          data={skeletonData as unknown[]}
          keyExtractor={(_, index) => `skeleton-${index}`}
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          contentContainerStyle={styles.listContent}
          renderItem={renderSkeleton}
          showsVerticalScrollIndicator={false}
        />
      ) : error && rooms.length === 0 ? (
        <View style={styles.errorState}>
          <View style={[styles.emptyIconWrap, styles.errorIconWrap]}>
            <Ionicons
              name="cloud-offline-outline"
              size={27}
              color={theme.COLORS.danger}
            />
          </View>
          <Text style={styles.emptyTitle}>Couldn’t load messages</Text>
          <Text style={styles.emptyDescription}>{error.message}</Text>
          <TouchableOpacity
            onPress={handleRetry}
            style={styles.retryButton}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color={theme.COLORS.white} />
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filteredRooms}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={styles.rowGap} />}
          contentContainerStyle={[
            styles.listContent,
            filteredRooms.length === 0 && styles.listContentEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={loading && rooms.length > 0}
              onRefresh={handleRetry}
              tintColor={theme.COLORS.primary}
              colors={[theme.COLORS.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <PrivateMessageCard
              message={item.lastMessage}
              time={item.lastMessageTimestamp}
              sender={item.name}
              isRead={item.unreadCount === 0}
              isSent={false}
              avatar={{ uri: item.avatarUrl ?? "" }}
              avatarUrl={item.avatarUrl}
              avatarInitial={item.name?.charAt(0).toUpperCase()}
              type={item.lastMessageType}
              newMessages={item.unreadCount > 0}
              unreadCount={item.unreadCount}
              lastMessageStatus={item.lastMessageStatus}
              onLongPress={(event) =>
                handleDeleteRoom(item.id, item.name, {
                  x: event.nativeEvent.pageX,
                  y: event.nativeEvent.pageY,
                  width: 0,
                  height: 0,
                })
              }
              onPress={() => void openRoom(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      activeOpacity={0.78}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
    >
      <Text
        style={[styles.filterLabel, selected && styles.filterLabelSelected]}
      >
        {label}
      </Text>
      <View
        style={[styles.filterCount, selected && styles.filterCountSelected]}
      >
        <Text
          style={[
            styles.filterCountText,
            selected && styles.filterCountTextSelected,
          ]}
        >
          {count > 99 ? "99+" : count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgMain,
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    color: theme.COLORS.primary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  heroSubtitle: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    marginTop: 4,
  },
  inboxMarkWrap: {
    width: 52,
    height: 52,
    marginLeft: theme.SPACING.md,
    position: "relative",
  },
  inboxMark: {
    width: 52,
    height: 52,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    ...theme.SHADOWS.primary,
  },
  inboxUnreadDot: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.secondary,
    borderWidth: 2,
    borderColor: theme.COLORS.bgMain,
  },
  inboxUnreadText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  searchContainer: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    marginHorizontal: theme.SPACING.xxl,
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    ...theme.SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.SPACING.md,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
  },
  filterRow: {
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  filterChip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  filterChipSelected: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  filterLabel: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  filterLabelSelected: {
    color: theme.COLORS.white,
  },
  filterCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: theme.COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  filterCountText: {
    color: theme.COLORS.textSecondary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  filterCountTextSelected: {
    color: theme.COLORS.white,
  },
  listHeading: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xxl,
    marginBottom: theme.SPACING.sm,
  },
  listTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  listMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  listCount: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.xxxxxxl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  rowGap: {
    height: theme.SPACING.md,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xxxxxl,
    paddingVertical: theme.SPACING.xxxxxxl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.lg,
  },
  emptyTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    textAlign: "center",
  },
  emptyDescription: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    lineHeight: 20,
    textAlign: "center",
    marginTop: theme.SPACING.sm,
  },
  emptyAction: {
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    marginTop: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  emptyActionText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xxxxxl,
    paddingBottom: theme.SPACING.xxxxxxl,
  },
  errorIconWrap: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  retryButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.xl,
    paddingHorizontal: theme.SPACING.xl,
    borderRadius: 15,
    backgroundColor: theme.COLORS.primary,
  },
  retryButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});
