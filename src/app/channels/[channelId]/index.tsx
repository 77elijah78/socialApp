import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PageHeader from "@/components/common/PageHeader";
import PrimaryButton from "@/components/common/PrimaryButton";
import ChannelComposer from "@/components/channels/ChannelComposer";
import ChannelPostCard from "@/components/channels/ChannelPostCard";
import { SkeletonBox } from "@/components/ui";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useAppSelector } from "@/store/hooks";
import {
  ChannelFeatureUnavailableError,
  channelService,
  type ChannelDetail,
  type ChannelPost,
} from "@/services/ChannelService";
import { showAppDialog } from "@/services/AppDialogService";
import {
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Params {
  channelId: string;
}

export default function ChannelFeedScreen() {
  const { channelId } = useLocalSearchParams() as unknown as Params;
  const userId = useAppSelector((state) => state.auth.user?.id);
  const insets = useSafeAreaInsets();
  const socialLimit = useRateLimit("social");
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [editing, setEditing] = useState<ChannelPost | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const actionInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (soft = false) => {
      if (!channelId) return;
      const id = ++requestId.current;
      if (!soft) setLoading(true);
      setError(null);
      try {
        const [detail, page] = await Promise.all([
          channelService.get(channelId),
          channelService.listPosts(channelId),
        ]);
        if (requestId.current !== id || !mounted.current) return;
        setChannel(detail);
        setPosts(page.posts);
        setCursor(page.nextCursor);
        setUnavailable(false);
      } catch (failure) {
        if (requestId.current !== id || !mounted.current) return;
        setUnavailable(failure instanceof ChannelFeatureUnavailableError);
        setError(failure instanceof Error ? failure.message : "Couldn’t load this channel.");
      } finally {
        if (requestId.current === id && mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [channelId],
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !cursor || !channelId) return;
    setLoadingMore(true);
    try {
      const page = await channelService.listPosts(channelId, cursor);
      if (!mounted.current) return;
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...page.posts.filter((post) => !seen.has(post.id))];
      });
      setCursor(page.nextCursor);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "Couldn’t load older posts.");
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [channelId, cursor, loading, loadingMore]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const toggleSubscription = useCallback(async () => {
    if (!channel || subscribing || actionInFlight.current || socialLimit.blocked) return;
    actionInFlight.current = true;
    setSubscribing(true);
    setError(null);
    try {
      const next = await channelService.subscribe(channel.id, !channel.isSubscribed);
      setChannel((current) =>
        current
          ? {
              ...current,
              isSubscribed: !current.isSubscribed,
              subscriberCount: Math.max(
                0,
                current.subscriberCount + (current.isSubscribed ? -1 : 1),
              ),
              ...(next.subscriberCount ? { subscriberCount: next.subscriberCount } : {}),
            }
          : current,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t update your subscription.");
    } finally {
      actionInFlight.current = false;
      setSubscribing(false);
    }
  }, [channel, socialLimit.blocked, subscribing]);

  const openMenu = useCallback(
    (post: ChannelPost) => {
      showAppDialog({
        title: "Post options",
        message: "Only channel admins see these controls.",
        presentation: "sheet",
        tone: "action",
        buttons: [
          { key: "cancel", label: "Cancel", cancel: true },
          {
            key: "edit",
            label: "Edit post",
            icon: "create-outline",
            onPress: () => {
              setEditing(post);
              setEditText(post.content.startsWith("[[sticker:") ? "" : post.content);
            },
          },
          {
            key: "pin",
            label: post.pinned ? "Unpin post" : "Pin post",
            icon: "pin-outline",
            onPress: async () => {
              if (actionInFlight.current) return;
              actionInFlight.current = true;
              try {
                const updated = await channelService.updatePost(channelId, post.id, {
                  pinned: !post.pinned,
                });
                setPosts((current) =>
                  current.map((item) =>
                    item.id === post.id ? { ...item, pinned: updated.pinned } : item,
                  ),
                );
              } catch (failure) {
                showAppDialog({
                  title: "Couldn’t update pin",
                  message: failure instanceof Error ? failure.message : "Please try again.",
                  tone: "error",
                });
              } finally {
                actionInFlight.current = false;
              }
            },
          },
          {
            key: "delete",
            label: "Delete post",
            destructive: true,
            icon: "trash-outline",
            onPress: () =>
              showAppDialog({
                title: "Delete this post?",
                message: "It will disappear for every subscriber.",
                tone: "warning",
                buttons: [
                  { key: "cancel", label: "Cancel", cancel: true },
                  {
                    key: "delete",
                    label: "Delete",
                    destructive: true,
                    onPress: async () => {
                      if (actionInFlight.current) return;
                      actionInFlight.current = true;
                      try {
                        await channelService.deletePost(channelId, post.id);
                        setPosts((current) => current.filter((item) => item.id !== post.id));
                      } catch (failure) {
                        showAppDialog({
                          title: "Couldn’t delete post",
                          message: failure instanceof Error ? failure.message : "Please try again.",
                          tone: "error",
                        });
                      } finally {
                        actionInFlight.current = false;
                      }
                    },
                  },
                ],
              }),
          },
        ],
      });
    },
    [channelId],
  );

  const saveEdit = useCallback(async () => {
    if (!editing || savingEdit || actionInFlight.current) return;
    const content = editText.trim();
    if (!content) return;
    actionInFlight.current = true;
    setSavingEdit(true);
    try {
      const updated = await channelService.updatePost(channelId, editing.id, { content });
      setPosts((current) =>
        current.map((post) =>
          post.id === editing.id ? { ...post, content: updated.content || content } : post,
        ),
      );
      setEditing(null);
    } catch (failure) {
      showAppDialog({
        title: "Couldn’t edit post",
        message: failure instanceof Error ? failure.message : "Please try again.",
        tone: "error",
      });
    } finally {
      actionInFlight.current = false;
      setSavingEdit(false);
    }
  }, [channelId, editText, editing, savingEdit]);

  const pinned = useMemo(() => posts.filter((post) => post.pinned), [posts]);
  const feed = useMemo(() => posts.filter((post) => !post.pinned), [posts]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Channel" />
        <View style={styles.loadingBody}>
          <SkeletonBox height={132} borderRadius={24} />
          <SkeletonBox height={64} borderRadius={18} />
          <SkeletonBox height={180} borderRadius={22} />
        </View>
      </View>
    );
  }

  if (!channel) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Channel" />
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name={unavailable ? "radio-outline" : "alert-circle-outline"} size={30} color={unavailable ? COLORS.accentBlue : COLORS.red} />
          </View>
          <Text style={styles.emptyTitle}>{unavailable ? "Channel unavailable" : "Couldn’t open channel"}</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <PrimaryButton title="Try again" onPress={() => void load()} style={styles.retry} />
        </View>
      </View>
    );
  }

  const header = (
    <View style={styles.headerStack}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroAvatarWrap}>
            {channel.avatarUrl ? (
              <Image source={{ uri: channel.avatarUrl }} style={styles.heroAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
                <Ionicons name="megaphone" size={28} color={COLORS.accentBlue} />
              </View>
            )}
            {channel.isPrivate ? (
              <View style={styles.privateBadge}><Ionicons name="lock-closed" size={10} color={COLORS.textWhite} /></View>
            ) : null}
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroName} numberOfLines={2}>{channel.name}</Text>
            <Text style={styles.heroMeta}>
              {channel.subscriberCount.toLocaleString()} subscriber{channel.subscriberCount === 1 ? "" : "s"}
              {channel.canPost ? " · You can publish" : ""}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(`/channels/${channel.id}/info`)}
            accessibilityRole="button"
            accessibilityLabel="Channel info"
            style={styles.infoButton}
          >
            <Ionicons name="information-circle-outline" size={21} color={COLORS.accentBlue} />
          </Pressable>
        </View>
        {channel.description ? (
          <Text style={styles.heroDescription}>{channel.description}</Text>
        ) : null}
        <View style={styles.heroActions}>
          <Pressable
            onPress={() => void toggleSubscription()}
            disabled={subscribing || socialLimit.blocked}
            accessibilityRole="button"
            accessibilityState={{ selected: channel.isSubscribed }}
            style={[
              styles.subscribe,
              channel.isSubscribed ? styles.subscribed : styles.notSubscribed,
              (subscribing || socialLimit.blocked) && styles.disabled,
            ]}
          >
            {subscribing ? (
              <ActivityIndicator size="small" color={channel.isSubscribed ? COLORS.accentBlue : COLORS.textWhite} />
            ) : (
              <Ionicons
                name={channel.isSubscribed ? "checkmark-circle" : "add-circle-outline"}
                size={17}
                color={channel.isSubscribed ? COLORS.accentBlue : COLORS.textWhite}
              />
            )}
            <Text style={[styles.subscribeText, channel.isSubscribed && styles.subscribeTextMuted]}>
              {channel.isSubscribed ? "Subscribed" : "Subscribe"}
            </Text>
          </Pressable>
          {channel.canPost ? (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.accentBlue} />
              <Text style={styles.adminText}>{channel.role === "owner" ? "Owner" : "Admin"}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {channel.canPost ? (
        <ChannelComposer channelId={channel.id} userId={userId} onPosted={() => void load(true)} />
      ) : (
        <View style={styles.readOnlyNote}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.readOnlyText}>Only channel admins can publish posts.</Text>
        </View>
      )}

      {error ? (
        <View style={styles.inlineError} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={COLORS.red} />
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      {pinned.length ? (
        <View style={styles.pinnedSection}>
          <View style={styles.sectionHeading}>
            <Ionicons name="pin" size={14} color={COLORS.accentBlue} />
            <Text style={styles.sectionTitle}>Pinned</Text>
          </View>
          <View style={styles.sectionGap}>
            {pinned.map((post) => (
              <ChannelPostCard key={post.id} post={post} canManage={channel.canPost} onMenu={openMenu} ownerId={userId} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHeading}>
        <Ionicons name="newspaper-outline" size={14} color={COLORS.textSecondary} />
        <Text style={styles.sectionTitle}>Posts</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <PageHeader
        title={channel.name}
        subtitle="Channel feed"
        right={
          <Pressable
            onPress={() => router.push(`/channels/${channel.id}/info`)}
            accessibilityRole="button"
            accessibilityLabel="Channel info"
            style={styles.headerInfo}
          >
            <Ionicons name="information-circle-outline" size={22} color={COLORS.accentBlue} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={feed}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => (
            <ChannelPostCard post={item} canManage={channel.canPost} onMenu={openMenu} ownerId={userId} />
          )}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.accentBlue} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, styles.emptyIconBlue]}>
                <Ionicons name="newspaper-outline" size={28} color={COLORS.accentBlue} />
              </View>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyText}>
                {channel.canPost
                  ? "Publish the first update above."
                  : "When admins publish, posts will appear here."}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={styles.footer} color={COLORS.accentBlue} /> : null
          }
        />
      </KeyboardAvoidingView>

      <Modal
        visible={Boolean(editing)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit post</Text>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              style={styles.editInput}
              multiline
              autoFocus
              maxLength={4000}
              textAlignVertical="top"
            />
            <View style={styles.editActions}>
              <Pressable onPress={() => setEditing(null)} style={styles.editCancel} disabled={savingEdit}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveEdit()}
                disabled={savingEdit || !editText.trim()}
                style={[styles.editSave, (savingEdit || !editText.trim()) && styles.disabled]}
              >
                {savingEdit ? <ActivityIndicator size="small" color={COLORS.textWhite} /> : <Text style={styles.editSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  flex: { flex: 1 },
  loadingBody: { padding: SPACING.xl, gap: SPACING.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xxxl, gap: SPACING.md },
  retry: { alignSelf: "stretch", marginTop: SPACING.lg },
  headerInfo: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF" },
  content: { padding: SPACING.xl },
  headerStack: { gap: SPACING.lg, marginBottom: SPACING.lg },
  hero: {
    padding: SPACING.lg,
    borderRadius: 24,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#D6E4FF",
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  heroAvatarWrap: { width: 66, height: 66, position: "relative" },
  heroAvatar: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#EAF2FF" },
  heroAvatarFallback: { alignItems: "center", justifyContent: "center" },
  privateBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.textPrimary,
    borderWidth: 2,
    borderColor: COLORS.bgWhite,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl6, fontWeight: "800" },
  heroMeta: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "600", marginTop: 3 },
  infoButton: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F8FF" },
  heroDescription: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, lineHeight: 19 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  subscribe: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SPACING.lg,
    borderRadius: 13,
  },
  notSubscribed: { backgroundColor: COLORS.accentBlue },
  subscribed: { backgroundColor: "#EAF2FF" },
  subscribeText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "700" },
  subscribeTextMuted: { color: COLORS.accentBlue },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F2F8FF",
  },
  adminText: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "700" },
  readOnlyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 14,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  readOnlyText: { flex: 1, color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 14,
    backgroundColor: COLORS.dangerLight,
  },
  inlineErrorText: { flex: 1, color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16 },
  pinnedSection: { gap: SPACING.md },
  sectionGap: { gap: SPACING.md },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: SPACING.xs, marginTop: SPACING.xs },
  sectionTitle: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  gap: { height: SPACING.md },
  empty: { alignItems: "center", paddingVertical: SPACING.xxxxl, paddingHorizontal: SPACING.xl, gap: SPACING.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.dangerLight, marginBottom: SPACING.sm },
  emptyIconBlue: { backgroundColor: "#EAF2FF" },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "700", textAlign: "center" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, lineHeight: 20, textAlign: "center" },
  footer: { marginVertical: SPACING.xl },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: SPACING.xl, backgroundColor: "rgba(20,18,36,0.4)" },
  editCard: { borderRadius: 24, padding: SPACING.xl, backgroundColor: COLORS.bgWhite, gap: SPACING.md },
  editTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "800" },
  editInput: {
    minHeight: 130,
    borderRadius: 16,
    backgroundColor: COLORS.bgInput,
    padding: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    lineHeight: 21,
  },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.sm },
  editCancel: { minHeight: 42, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.lg, borderRadius: 13, backgroundColor: COLORS.bgInput },
  editCancelText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "600" },
  editSave: { minHeight: 42, minWidth: 82, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: COLORS.accentBlue },
  editSaveText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
