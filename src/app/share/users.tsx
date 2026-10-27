import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { shareService, FollowedUser } from "@/services/ShareService";
import { mediaService } from "@/services/MediaService";
import theme from "@/constants/theme";
import { showAppDialog } from "@/services/AppDialogService";

export default function ShareUsersScreen() {
  const params = useLocalSearchParams<{
    postId?: string;
    storyId?: string;
    title?: string;
    message?: string;
    url?: string;
  }>();

  const postId = params.postId ?? null;
  const storyId = params.storyId ?? null;
  const title = params.title ?? "Share to";
  const message = params.message ?? "";
  const url = params.url ?? "";

  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";
  const currentUserDisplayName = useAppSelector((s) => s.auth.user?.displayName ?? s.auth.user?.username) ?? "User";

  const [following, setFollowing] = useState<FollowedUser[]>([]);
  const [suggested, setSuggested] = useState<FollowedUser[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(true);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchFollowing = useCallback(async () => {
    if (!token) return;
    try {
      const result = await shareService.getMyFollowing(token);
      setFollowing(result.users);
    } catch (err) {
      console.error("Failed to load following:", err);
    } finally {
      setLoadingFollowing(false);
    }
  }, [token]);

  const fetchSuggested = useCallback(async () => {
    if (!token) return;
    try {
      const result = await shareService.getSuggestedUsers(token);
      setSuggested(result.users);
    } catch (err) {
      console.error("Failed to load suggested:", err);
    } finally {
      setLoadingSuggested(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) return;
      setLoadingFollowing(true);
      setLoadingSuggested(true);
      try {
        const [followingResult, suggestedResult] = await Promise.all([
          shareService.getMyFollowing(token),
          shareService.getSuggestedUsers(token),
        ]);
        if (!cancelled) {
          setFollowing(followingResult.users);
          setSuggested(suggestedResult.users);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load users:", err);
          showAppDialog({
            title: "Couldn’t load people",
            message: "Please check your connection and try again.",
            tone: "error",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingFollowing(false);
          setLoadingSuggested(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const toggleUser = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    if (sending || selectedIds.size === 0 || !token) return;
    const allUsers = [...following, ...suggested];
    const selectedUsers = allUsers.filter((u) => selectedIds.has(u.id));
    if (selectedUsers.length === 0) return;

    setSending(true);
    try {
      for (const user of selectedUsers) {
        const conversation = await shareService.startConversation(token, user.id);

        if (postId) {
          await shareService.sharePost(token, postId, conversation.conversationId);
          await mediaService.message.sendSharedPost(
            {
              postId: postId,
              content: message,
              authorName: currentUserDisplayName,
              authorAvatarUrl: null,
              imageUrl: null,
            },
            {
              senderId: currentUserId,
              receiverId: user.id,
              conversationId: conversation.conversationId,
            },
          );
        }

        if (storyId) {
          await shareService.shareStory(token, storyId, conversation.conversationId);
          await mediaService.message.sendSharedStory(
            {
              storyId: storyId,
              mediaUrl: url,
              mediaType: "image",
              caption: message,
              authorName: currentUserDisplayName,
              authorAvatarUrl: null,
            },
            {
              senderId: currentUserId,
              receiverId: user.id,
              conversationId: conversation.conversationId,
            },
          );
        }
      }

      showAppDialog({
        title: "Sent",
        message: `Shared with ${selectedUsers.length} ${selectedUsers.length > 1 ? "people" : "person"}.`,
        tone: "success",
        buttons: [{ key: "done", label: "Done", bold: true, onPress: () => router.back() }],
      });
    } catch (err) {
      console.error("Failed to share:", err);
      showAppDialog({
        title: "Couldn’t share",
        message: "Please try again in a moment.",
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  }, [sending, selectedIds, following, suggested, token, postId, storyId, message, url, currentUserId]);

  const renderItem = useCallback(({ item }: { item: FollowedUser }) => {
    const displayName = item.displayName ?? item.username;
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => toggleUser(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          {item.avatarUrl ? (
            <View style={styles.avatarImageContainer}>
              <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          ) : (
            <View style={[styles.avatarImageContainer, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.userHandle}>@{item.username}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={18} color={theme.COLORS.white} />}
        </View>
      </TouchableOpacity>
    );
  }, [selectedIds, toggleUser]);

  const ListEmptyComponent = useCallback(() => {
    if (loadingFollowing || loadingSuggested) {
      return (
        <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      );
    }
    return (
      <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
        <Text style={{ color: theme.COLORS.textMuted }}>No users found</Text>
      </View>
    );
  }, [loadingFollowing, loadingSuggested]);

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  const renderUserItem = (user: FollowedUser) => {
    const displayName = user.displayName ?? user.username;
    const isSelected = selectedIds.has(user.id);

    return (
      <TouchableOpacity
        key={user.id}
        style={styles.userItem}
        onPress={() => toggleUser(user.id)}
        activeOpacity={0.7}
      >
        <View style={styles.avatar}>
          {user.avatarUrl ? (
            <View style={styles.avatarImageContainer}>
              <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          ) : (
            <View style={[styles.avatarImageContainer, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.userHandle}>@{user.username}</Text>
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={18} color={theme.COLORS.white} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <TouchableOpacity
          style={[styles.sendButton, (sending || selectedIds.size === 0) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending || selectedIds.size === 0}
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.COLORS.white} />
          ) : (
            <Text style={styles.sendButtonText}>Send ({selectedIds.size})</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {renderSectionHeader("Following")}
        {loadingFollowing ? (
          <View style={{ paddingVertical: theme.SPACING.lg, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.COLORS.primary} />
          </View>
        ) : (
          following.map((user) => renderUserItem(user))
        )}

        {renderSectionHeader("Suggested")}
        {loadingSuggested ? (
          <View style={{ paddingVertical: theme.SPACING.lg, alignItems: "center" }}>
            <ActivityIndicator size="small" color={theme.COLORS.primary} />
          </View>
        ) : (
          suggested.map((user) => renderUserItem(user))
        )}

        {!loadingFollowing && !loadingSuggested && following.length === 0 && suggested.length === 0 ? (
          <View style={{ paddingVertical: theme.SPACING.xxxxl, alignItems: "center" }}>
            <Text style={{ color: theme.COLORS.textMuted }}>No users found</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  backButton: {
    padding: theme.SPACING.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
    color: theme.COLORS.textPrimary,
    textAlign: "center",
  },
  sendButton: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.primary,
    borderRadius: theme.BORDER_RADIUS.full,
    minWidth: 80,
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: theme.COLORS.textMuted,
  },
  sendButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: theme.SPACING.md,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.sm,
  },
  sectionHeaderText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    gap: theme.SPACING.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImageContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarPlaceholder: {
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.COLORS.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  userHandle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.COLORS.borderDivider,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
});
