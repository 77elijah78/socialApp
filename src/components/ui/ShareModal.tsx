import React, { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Pressable, FlatList, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppSelector } from "@/store/hooks";
import { shareService, FollowedUser } from "@/services/ShareService";
import { mediaService } from "@/services/MediaService";
import { ShareOptions } from "@/providers/OverlayProvider";
import theme from "@/constants/theme";

export interface ShareModalProps {
  visible: boolean;
  postId?: string | null;
  storyId?: string | null;
  onClose: () => void;
}

const ShareModal = ({ visible, postId, storyId, onClose }: ShareModalProps) => {
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";
  const currentUserDisplayName = useAppSelector((s) => s.auth.user?.displayName ?? s.auth.user?.username) ?? "User";

  const [following, setFollowing] = useState<FollowedUser[]>([]);
  const [suggested, setSuggested] = useState<FollowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setFollowing([]);
      setSuggested([]);
      setSearchQuery("");
      setSelectedIds(new Set());
      setError(null);
      setLoading(true);
      return;
    }

    let cancelled = false;
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
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
          console.error("Failed to load share users:", err);
          setError("Failed to load users. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [visible, token]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [...following, ...suggested];
    const all = [...following, ...suggested];
    return all.filter((u) => {
      const name = (u.displayName ?? u.username).toLowerCase();
      const handle = u.username.toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [following, suggested, searchQuery]);

  const selectedCount = selectedIds.size;

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
    if (sending || selectedCount === 0 || !token) return;
    const allUsers = [...following, ...suggested];
    const selectedUsers = allUsers.filter((u) => selectedIds.has(u.id));
    if (selectedUsers.length === 0) return;

    setSending(true);
    Keyboard.dismiss();
    try {
      for (const user of selectedUsers) {
        const conversation = await shareService.startConversation(token, user.id);

        if (postId) {
          await shareService.sharePost(token, postId, conversation.conversationId);
          await mediaService.message.sendSharedPost(
            {
              postId: postId,
              content: "",
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
              mediaUrl: "",
              mediaType: "image",
              caption: null,
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

      onClose();
    } catch (err) {
      console.error("Failed to share:", err);
      setError("Failed to share. Please try again.");
    } finally {
      setSending(false);
    }
  }, [sending, selectedCount, selectedIds, following, suggested, token, postId, storyId, currentUserId, currentUserDisplayName, onClose]);

  const renderUserItem = useCallback(({ item }: { item: FollowedUser }) => {
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
    if (loading) {
      return (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
          <Text style={styles.stateText}>Loading users...</Text>
        </View>
      );
    }
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="person-outline" size={40} color={theme.COLORS.textMuted} />
        <Text style={styles.stateText}>No users found</Text>
        <Text style={styles.stateSubtext}>Try a different search term</Text>
      </View>
    );
  }, [loading]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerClose}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Share</Text>
            <TouchableOpacity
              style={[styles.sendButton, (sending || selectedCount === 0) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={sending || selectedCount === 0}
            >
              {sending ? (
                <ActivityIndicator size="small" color={theme.COLORS.white} />
              ) : (
                <Text style={styles.sendButtonText}>Send{selectedCount > 0 ? ` (${selectedCount})` : ""}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={18} color={theme.COLORS.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor={theme.COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={theme.COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={theme.COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <Ionicons name="close" size={18} color={theme.COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderUserItem}
            ListEmptyComponent={ListEmptyComponent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </View>
    </Modal>
  );
};

ShareModal.displayName = "ShareModal";

export default ShareModal;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    backgroundColor: theme.COLORS.bgLight,
    borderTopLeftRadius: theme.BORDER_RADIUS.xxxxxl,
    borderTopRightRadius: theme.BORDER_RADIUS.xxxxxl,
    maxHeight: "85%",
    paddingBottom: 16,
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: theme.COLORS.borderGray,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 12,
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
  headerClose: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textSecondary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
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
  searchContainer: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.COLORS.bgAuthInput,
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    paddingHorizontal: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  searchIcon: {
    marginRight: theme.SPACING.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.dangerLight,
    marginHorizontal: theme.SPACING.md,
    marginTop: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.md,
  },
  errorText: {
    flex: 1,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.danger,
  },
  listContent: {
    paddingBottom: 16,
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
  stateContainer: {
    paddingVertical: theme.SPACING.xxxxl,
    alignItems: "center",
  },
  stateText: {
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
  },
  stateSubtext: {
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.xs,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
});
