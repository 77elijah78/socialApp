import React, { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Pressable, FlatList, Keyboard, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppSelector } from "@/store/hooks";
import { shareService, FollowedUser } from "@/services/ShareService";
import { mediaService } from "@/services/MediaService";
import { ShareOptions } from "@/providers/OverlayProvider";
import theme from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ShareModalProps {
  visible: boolean;
  postId?: string | null;
  storyId?: string | null;
  onClose: () => void;
}

const ShareModal = ({ visible, postId, storyId, onClose }: ShareModalProps) => {
  const insets = useSafeAreaInsets();
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

  const resetShareState = useCallback(() => {
    setFollowing([]);
    setSuggested([]);
    setSearchQuery("");
    setSelectedIds(new Set());
    setError(null);
    setLoading(true);
  }, []);

  const handleClose = useCallback(() => {
    resetShareState();
    onClose();
  }, [onClose, resetShareState]);

  useEffect(() => {
    if (!visible || !token) return;

    let cancelled = false;
    const load = async () => {
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

      handleClose();
    } catch (err) {
      console.error("Failed to share:", err);
      setError("Failed to share. Please try again.");
    } finally {
      setSending(false);
    }
  }, [sending, selectedCount, selectedIds, following, suggested, token, postId, storyId, currentUserId, currentUserDisplayName, handleClose]);

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
            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImageContainer} />
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
      onRequestClose={handleClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.SPACING.xl) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
    backgroundColor: theme.COLORS.bgWhite,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    paddingBottom: theme.SPACING.xl,
    borderTopWidth: 1,
    borderColor: "#ECEAF4",
    shadowColor: "#17152B",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 38,
    height: 4,
    backgroundColor: "#D9D7E3",
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginTop: theme.SPACING.md,
    marginBottom: theme.SPACING.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
  },
  headerClose: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textSecondary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  sendButton: {
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: 10,
    backgroundColor: theme.COLORS.primary,
    borderRadius: 15,
    minWidth: 84,
    minHeight: 39,
    alignItems: "center",
    justifyContent: "center",
    ...theme.SHADOWS.primary,
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
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
  },
  searchInputWrapper: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F6FB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: theme.SPACING.lg,
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
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.sm,
    gap: theme.SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0EEF5",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImageContainer: {
    width: 44,
    height: 44,
    borderRadius: 16,
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
