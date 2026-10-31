import React, {
  useState,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useKeyboardState } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppSelector } from "@/store/hooks";
import { usePostComments } from "@/hooks/usePostComments";
import { Comment } from "@/types";
import * as theme from "@/constants/theme";
import { CommentsSkeleton } from "@/components/ui";
import {
  buildCommentThreads,
  CommentThread,
  CommentThreadNode,
} from "@/components/posts/CommentThread";

export default function CommentsScreen() {
  const { id: postId } = useLocalSearchParams<{ id: string }>();
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = currentUser?.id ?? "";
  const keyboardIsVisible = useKeyboardState((state) => state.isVisible);

  const { comments, total, loading, error, refresh, send } =
    usePostComments(postId);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const scope = useRef(0);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  useLayoutEffect(() => {
    scope.current += 1;
    sendingRef.current = false;
    // A different external post/account owns a new draft, not a keyboard remount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSending(false);
    setInput("");
    setReplyingTo(null);
    setSendError(null);
    return () => {
      scope.current += 1;
    };
  }, [postId, currentUserId]);

  const commentThreads = useMemo(
    () => buildCommentThreads(comments),
    [comments],
  );

  const handleProfilePress = useCallback(
    (username: string) => {
      if (keyboardIsVisible) {
        Keyboard.dismiss();
        return;
      }
      router.push(`/user/${username}`);
    },
    [keyboardIsVisible],
  );

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    const epoch = scope.current;
    setSendError(null);
    setSending(true);
    try {
      await send(content, replyingTo?.id ?? null);
      if (scope.current === epoch) {
        setInput("");
        setReplyingTo(null);
      }
    } catch (cause) {
      if (scope.current === epoch)
        setSendError(
          cause instanceof Error ? cause.message : "Could not send comment",
        );
    } finally {
      if (scope.current === epoch) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, [input, replyingTo, send]);

  const renderItem = useCallback(
    ({ item }: { item: CommentThreadNode }) => (
      <CommentThread
        node={item}
        currentUserId={currentUserId}
        keyboardIsVisible={keyboardIsVisible}
        onReply={setReplyingTo}
        onProfilePress={handleProfilePress}
      />
    ),
    [currentUserId, keyboardIsVisible, handleProfilePress],
  );

  // This custom header owns the top inset; this screen also owns the bottom
  // and horizontal safe areas. Keep the previous platform avoidance behavior.
  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={theme.COLORS.textPrimary}
            />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>POST CONVERSATION</Text>
            <Text style={styles.headerTitle}>Comments</Text>
          </View>
          <View style={styles.headerMark}>
            <Ionicons
              name="chatbubble-ellipses"
              size={17}
              color={theme.COLORS.primary}
            />
          </View>
        </View>

        {error ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void refresh()}
          >
            <Text style={styles.emptySubtitle}>{error} · Tap to retry</Text>
          </TouchableOpacity>
        ) : null}
        {loading ? (
          <View style={styles.loadingContent}>
            <CommentsSkeleton count={5} />
          </View>
        ) : (
          <FlatList
            data={commentThreads}
            keyExtractor={(item) => item.comment.id}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.listContent,
              commentThreads.length === 0 && styles.emptyListContent,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={false}
            contentInsetAdjustmentBehavior="never"
            ListFooterComponent={
              total > comments.length ? (
                <Text style={styles.emptySubtitle}>
                  Showing {comments.length} of {total} comments. This server
                  does not yet support more pages.
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={25}
                    color={theme.COLORS.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {error ? "Comments unavailable" : "No comments yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  Be the first to join the conversation.
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.composer}>
          {sendError ? (
            <Text accessibilityRole="alert" style={styles.emptySubtitle}>
              {sendError}. Your draft is kept; tap Send to retry.
            </Text>
          ) : null}
          {replyingTo ? (
            <View style={styles.replyingPreview}>
              <View style={styles.replyingCopy}>
                <Text style={styles.replyingTitle} numberOfLines={1}>
                  Replying to @{replyingTo.author?.username ?? "comment"}
                </Text>
                <Text style={styles.replyingText} numberOfLines={1}>
                  {replyingTo.content}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyingTo(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={theme.COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={replyingTo ? "Write a reply..." : "Add a comment..."}
              placeholderTextColor={theme.COLORS.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => void handleSend()}
              returnKeyType="send"
              editable={!sending}
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
              ]}
              onPress={() => void handleSend()}
              disabled={!input.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel={replyingTo ? "Post reply" : "Post comment"}
            >
              {sending ? (
                <ActivityIndicator size="small" color={theme.COLORS.white} />
              ) : (
                <Ionicons name="send" size={18} color={theme.COLORS.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgMain,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgMain,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerEyebrow: {
    color: theme.COLORS.primary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
  },
  headerTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    marginTop: 2,
  },
  headerMark: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  loadingContent: {
    flex: 1,
    paddingTop: theme.SPACING.xl,
  },
  listContent: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.xl,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.xxxxl,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    marginBottom: theme.SPACING.md,
  },
  emptyTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  emptySubtitle: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
    marginTop: theme.SPACING.xs,
  },
  composer: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.COLORS.borderDivider,
  },
  replyingPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    marginBottom: theme.SPACING.sm,
    marginLeft: 48,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.bgLight,
  },
  replyingCopy: {
    flex: 1,
    minWidth: 0,
  },
  replyingTitle: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  replyingText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    borderRadius: theme.BORDER_RADIUS.full,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textPrimary,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  sendBtnDisabled: {
    opacity: 0.48,
  },
});
