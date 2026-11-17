import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import PageHeader from "@/components/common/PageHeader";
import { SkeletonBox } from "@/components/ui";
import { useDebounce } from "@/hooks/useDebounce";
import { ChannelFeatureUnavailableError, channelService, type Channel } from "@/services/ChannelService";
import {
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

type Scope = "discover" | "subscribed";

function ChannelRow({ channel }: { channel: Channel }) {
  return (
    <Pressable
      onPress={() => router.push(`/channels/${channel.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${channel.name}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.avatarWrap}>
        {channel.avatarUrl ? (
          <Image source={{ uri: channel.avatarUrl }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{channel.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.broadcastBadge}>
          <Ionicons name="megaphone" size={10} color={COLORS.textWhite} />
        </View>
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>{channel.name}</Text>
          {channel.isPrivate ? <Ionicons name="lock-closed" size={12} color={COLORS.textMuted} /> : null}
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {channel.description || "Broadcast updates, media and pinned posts."}
        </Text>
        <Text style={styles.meta}>
          {channel.subscriberCount.toLocaleString()} subscriber{channel.subscriberCount === 1 ? "" : "s"}
          {channel.isSubscribed ? " · Subscribed" : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </Pressable>
  );
}

export default function ChannelsScreen() {
  const [scope, setScope] = useState<Scope>("discover");
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 300);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(
    async (options: { reset?: boolean; page?: number } = {}) => {
      const id = ++requestId.current;
      const nextPage = options.page ?? 1;
      if (options.reset !== false) {
        setError(null);
        if (nextPage === 1) setLoading(true);
      }
      try {
        const result = await channelService.list(debounced, scope, nextPage);
        if (requestId.current !== id) return;
        setUnavailable(false);
        setChannels((current) => {
          if (nextPage === 1) return result;
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...result.filter((item) => !seen.has(item.id))];
        });
        setPage(nextPage);
        setHasMore(result.length >= 20);
      } catch (failure) {
        if (requestId.current !== id) return;
        setUnavailable(failure instanceof ChannelFeatureUnavailableError);
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t load channels right now.",
        );
        if (nextPage === 1) setChannels([]);
      } finally {
        if (requestId.current === id) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [debounced, scope],
  );

  useFocusEffect(
    useCallback(() => {
      // Returning from a channel should reflect subscribe/publish changes.
      void load({ reset: true, page: 1 });
    }, [load]),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load({ reset: true, page: 1 });
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    setLoadingMore(true);
    void load({ reset: false, page: page + 1 }).finally(() => setLoadingMore(false));
  }, [hasMore, load, loading, loadingMore, page, refreshing]);

  const header = (
    <>
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="radio" size={24} color={COLORS.accentBlue} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introEyebrow}>BROADCAST</Text>
          <Text style={styles.introTitle}>Channels</Text>
          <Text style={styles.introText}>Follow voices, teams and creators. Only admins publish.</Text>
        </View>
      </View>
      <View style={styles.tabs}>
        {(["discover", "subscribed"] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setScope(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected: scope === item }}
            style={[styles.tab, scope === item && styles.tabActive]}
          >
            <Text style={[styles.tabText, scope === item && styles.tabTextActive]}>
              {item === "discover" ? "Discover" : "Subscribed"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search channels"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Channels"
        subtitle="Broadcast feeds"
        right={
          <Pressable
            onPress={() => router.push("/channels/create")}
            accessibilityRole="button"
            accessibilityLabel="Create a channel"
            style={styles.createButton}
          >
            <Ionicons name="add" size={22} color={COLORS.textWhite} />
          </Pressable>
        }
      />
      <FlatList
        data={loading && !channels.length ? [] : channels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChannelRow channel={item} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletons}>
              {[0, 1, 2, 3].map((key) => (
                <SkeletonBox key={key} height={94} borderRadius={22} />
              ))}
            </View>
          ) : error ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, unavailable && styles.emptyIconBlue]}>
                <Ionicons name={unavailable ? "cloud-offline-outline" : "alert-circle-outline"} size={28} color={unavailable ? COLORS.accentBlue : COLORS.red} />
              </View>
              <Text style={styles.emptyTitle}>{unavailable ? "Channels are coming online" : "Couldn’t load channels"}</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable onPress={() => void load({ reset: true, page: 1 })} style={styles.retry} accessibilityRole="button">
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, styles.emptyIconBlue]}>
                <Ionicons name="megaphone-outline" size={28} color={COLORS.accentBlue} />
              </View>
              <Text style={styles.emptyTitle}>
                {query ? "No channels found" : scope === "subscribed" ? "No subscriptions yet" : "No public channels yet"}
              </Text>
              <Text style={styles.emptyText}>
                {query
                  ? "Try a different search."
                  : scope === "subscribed"
                    ? "Discover a channel and subscribe to see it here."
                    : "Create the first channel and start broadcasting."}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && channels.length ? (
            <ActivityIndicator style={styles.footerLoading} color={COLORS.primary} />
          ) : loadingMore ? (
            <ActivityIndicator style={styles.footerLoading} color={COLORS.primary} />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  listContent: { padding: SPACING.xl, paddingBottom: SPACING.xxxxxl },
  gap: { height: SPACING.md },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentBlue,
    ...SHADOWS.sm,
  },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    padding: SPACING.xl,
    borderRadius: 24,
    backgroundColor: "#EAF2FF",
    borderWidth: 1,
    borderColor: "#DCE8FF",
    marginBottom: SPACING.lg,
  },
  introIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgWhite,
  },
  introCopy: { flex: 1, minWidth: 0 },
  introEyebrow: { color: COLORS.accentBlue, fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
  introTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl6, fontWeight: "800", marginTop: 1 },
  introText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16, marginTop: 2 },
  tabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 16,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    marginBottom: SPACING.md,
  },
  tab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  tabActive: { backgroundColor: COLORS.accentBlue },
  tabText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "600" },
  tabTextActive: { color: COLORS.textWhite },
  searchBox: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    marginBottom: SPACING.lg,
  },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#E8EEF9",
    ...SHADOWS.sm,
  },
  rowPressed: { opacity: 0.8 },
  avatarWrap: { width: 58, height: 58, position: "relative" },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#EAF2FF" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.xl6, fontWeight: "800" },
  broadcastBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accentBlue,
    borderWidth: 2,
    borderColor: COLORS.bgWhite,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  name: { flexShrink: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "700" },
  description: { marginTop: 2, color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16 },
  meta: { marginTop: 4, color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "600" },
  skeletons: { gap: SPACING.md },
  empty: { alignItems: "center", paddingVertical: SPACING.xxxxxl, paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.dangerLight, marginBottom: SPACING.sm },
  emptyIconBlue: { backgroundColor: "#EAF2FF" },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "700", textAlign: "center" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, lineHeight: 20, textAlign: "center" },
  retry: { marginTop: SPACING.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: 14, backgroundColor: COLORS.accentBlue },
  retryText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "700" },
  footerLoading: { marginVertical: SPACING.xl },
});
