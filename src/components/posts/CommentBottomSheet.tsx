import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetTextInput,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";

import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { router } from "expo-router";
import { Comment, PostOneResponse } from "@/types";
import { CommentThread, buildCommentThreads, CommentThreadNode } from "@/components/posts/CommentThread";
import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

export interface CommentBottomSheetRef {
  open: (postId: string) => void;
  close: () => void;
}

function countThreadNodes(nodes: CommentThreadNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + countThreadNodes(node.replies),
    0,
  );
}

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 88;

interface CommentSheetComposerRef {
  replyTo: (comment: Comment) => void;
  reset: () => void;
}

interface CommentSheetComposerProps extends BottomSheetFooterProps {
  onSend: (content: string, repliedToId: string | null) => Promise<void>;
}

// Keep the footer component type stable while editing. A renderFooter callback
// that depends on the draft would remount the native TextInput on every keypress.
const CommentSheetComposer = React.forwardRef<
  CommentSheetComposerRef,
  CommentSheetComposerProps
>(({ animatedFooterPosition, onSend }, ref) => {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = screenWidth < 375;
  const horizontalPadding = Math.max(14, Math.min(24, screenWidth * 0.045));
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserAvatarUrl = currentUser?.avatarUrl;
  const currentUserInitial = (
    currentUser?.displayName || currentUser?.username || "You"
  ).charAt(0).toUpperCase();
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);

  React.useImperativeHandle(ref, () => ({
    replyTo: setReplyingTo,
    reset: () => {
      setInput("");
      setInputHeight(MIN_INPUT_HEIGHT);
      setReplyingTo(null);
      setSending(false);
    },
  }), []);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sending) return;

    const repliedToId = replyingTo?.id ?? null;
    setInput("");
    setInputHeight(MIN_INPUT_HEIGHT);
    setReplyingTo(null);
    setSending(true);
    try {
      await onSend(content, repliedToId);
    } finally {
      setSending(false);
    }
  }, [input, sending, replyingTo, onSend]);

  return (
    <BottomSheetFooter animatedFooterPosition={animatedFooterPosition}>
      <View style={styles.footer}>
        <View
          style={[
            styles.inputContainer,
            {
              paddingLeft: horizontalPadding + insets.left,
              paddingRight: horizontalPadding + insets.right,
            },
          ]}
        >
          {replyingTo ? (
            <View style={styles.replyingPreview}>
              <View style={styles.replyingPreviewCopy}>
                <Text style={styles.replyingPreviewTitle} numberOfLines={1}>
                  Replying to @{replyingTo.author?.username ?? "comment"}
                </Text>
                <Text style={styles.replyingPreviewText} numberOfLines={1}>
                  {replyingTo.content}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                onPress={() => setReplyingTo(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <View style={styles.userAvatar}>
              {currentUserAvatarUrl ? (
                <Image
                  source={{ uri: currentUserAvatarUrl }}
                  style={styles.userAvatarImage}
                />
              ) : (
                <Text style={styles.userAvatarText}>
                  {currentUserInitial}
                </Text>
              )}
            </View>

            <BottomSheetTextInput
              style={[
                styles.input,
                isCompact && styles.inputCompact,
                { height: inputHeight },
              ]}
              placeholder={replyingTo ? "Write a reply..." : "Add a comment..."}
              placeholderTextColor={COLORS.textMuted}
              value={input}
              onChangeText={setInput}
              onContentSizeChange={(event) => {
                const nextHeight = Math.min(
                  MAX_INPUT_HEIGHT,
                  Math.max(MIN_INPUT_HEIGHT, event.nativeEvent.contentSize.height),
                );
                setInputHeight(nextHeight);
              }}
              onSubmitEditing={() => void handleSend()}
              returnKeyType="send"
              editable={!sending}
              multiline
              maxLength={1000}
              textAlignVertical="center"
              blurOnSubmit={false}
            />

            <TouchableOpacity
              style={[
                styles.postButton,
                (!input.trim() || sending) && styles.postButtonDisabled,
              ]}
              onPress={() => void handleSend()}
              disabled={!input.trim() || sending}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={replyingTo ? "Post reply" : "Post comment"}
            >
              {sending ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="send" size={18} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </BottomSheetFooter>
  );
});

CommentSheetComposer.displayName = "CommentSheetComposer";

export const CommentBottomSheet = React.forwardRef<CommentBottomSheetRef>(
  (_, ref) => {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const keyboardIsVisible = useKeyboardState((state) => state.isVisible);
    const isCompact = screenWidth < 375;
    const horizontalPadding = Math.max(14, Math.min(24, screenWidth * 0.045));

    const [postId, setPostId] = useState<string | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [commentCount, setCommentCount] = useState(0);

    const token = useAppSelector((s) => s.auth.token);
    const currentUser = useAppSelector((s) => s.auth.user);
    const currentUserId = currentUser?.id;
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const composerRef = useRef<CommentSheetComposerRef>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const pendingProfileNavigationRef = useRef<string | null>(null);
    const commentThreads = useMemo(() => buildCommentThreads(comments), [comments]);
    // Detents must not change when the keyboard opens. Gorhom owns the sheet
    // animation, footer position, measured footer height, and blur restoration.
    const snapPoints = useMemo(() => ["66%", "92%"], []);

    const fetchComments = useCallback(
      async (pid: string) => {
        if (!token) return;

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoading(true);
        setFetchError(null);

        try {
          const resp = await api.get<{
            success: boolean;
            data: PostOneResponse;
          }>(`/posts/${pid}`, token, {
            signal: controller.signal,
          });

          const fetched = resp.data.comments ?? [];
          setComments(fetched);
          setCommentCount(countThreadNodes(buildCommentThreads(fetched)));
        } catch (err) {
          if ((err as Error)?.name !== "AbortError") {
            setFetchError(
              err instanceof Error ? err.message : "Failed to load comments",
            );
          }
        } finally {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
            setLoading(false);
          }
        }
      },
      [token],
    );

    const handleSend = useCallback(async (content: string, repliedToId: string | null) => {
      if (!content || !postId) return;

      const temporaryId = `local-comment-${Date.now()}`;
      const optimisticComment: Comment = {
        id: temporaryId,
        content,
        authorId: currentUserId ?? "",
        postId,
        createdAt: new Date(),
        repliedToId,
        author: currentUser ?? undefined,
      };

      setComments((previous) => [...previous, optimisticComment]);
      setCommentCount((previous) => previous + 1);

      if (!token) return;

      try {
        const resp = await api.post<{
          success: boolean;
          data: Comment;
        }>(
          `/posts/${postId}/comments`,
          { content, repliedToId: optimisticComment.repliedToId },
          token,
        );

        setComments((previous) =>
          previous.map((comment) =>
            comment.id === temporaryId
              ? {
                  ...optimisticComment,
                  ...resp.data,
                  author: resp.data.author ?? optimisticComment.author,
                  repliedToId: resp.data.repliedToId ?? optimisticComment.repliedToId,
                }
              : comment,
          ),
        );
      } catch (err) {
        // Keep the local optimistic comment so replies remain testable without a backend.
        console.warn("Comment saved locally; API request failed:", err);
      }
    }, [token, postId, currentUserId, currentUser]);

    const handleReply = useCallback((comment: Comment) => {
      composerRef.current?.replyTo(comment);
    }, []);

    const renderFooter = useCallback(
      (props: BottomSheetFooterProps) => (
        <CommentSheetComposer {...props} ref={composerRef} onSend={handleSend} />
      ),
      [handleSend],
    );

    const open = useCallback(
      (pid: string) => {
        pendingProfileNavigationRef.current = null;
        composerRef.current?.reset();
        setPostId(pid);
        setComments([]);
        setCommentCount(0);
        setFetchError(null);

        bottomSheetRef.current?.present();
        void fetchComments(pid);
      },
      [fetchComments],
    );

    const close = useCallback(() => {
      abortControllerRef.current?.abort();
      Keyboard.dismiss();
      bottomSheetRef.current?.dismiss();
    }, []);

    const handleProfilePress = useCallback(
      (username: string) => {
        if (keyboardIsVisible) {
          Keyboard.dismiss();
          return;
        }

        pendingProfileNavigationRef.current = username;
        close();
      },
      [keyboardIsVisible, close],
    );

    React.useImperativeHandle(ref, () => ({ open, close }), [open, close]);

    const renderBackdrop = useCallback(
      (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.4}
          pressBehavior="close"
        />
      ),
      [],
    );

    const renderItem = useCallback(
      ({ item }: { item: CommentThreadNode }) => (
        <CommentThread
          node={item}
          currentUserId={currentUserId}
          keyboardIsVisible={keyboardIsVisible}
          onReply={handleReply}
          onProfilePress={handleProfilePress}
        />
      ),
      [currentUserId, keyboardIsVisible, handleReply, handleProfilePress],
    );

    const ListEmptyComponent = useCallback(() => {
      if (loading) {
        return (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.stateText}>Loading comments...</Text>
          </View>
        );
      }

      if (fetchError) {
        return (
          <View style={styles.stateContainer}>
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color={COLORS.textMuted}
            />
            <Text style={styles.stateText}>{fetchError}</Text>
            <TouchableOpacity
              onPress={() => postId && void fetchComments(postId)}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.stateContainer}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={40}
            color={COLORS.textMuted}
          />
          <Text style={styles.stateText}>No comments yet</Text>
          <Text style={styles.stateSubtext}>Be the first to comment</Text>
        </View>
      );
    }, [loading, fetchError, postId, fetchComments]);

    // KeyboardProvider keeps the Android root full-height. Gorhom's resize
    // mode would assume an IME resize and discard the actual keyboard height.
    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        enableOverDrag={false}
        backdropComponent={renderBackdrop}
        footerComponent={renderFooter}
        handleIndicatorStyle={{
          backgroundColor: COLORS.borderGray,
          width: 36,
        }}
        handleStyle={{
          backgroundColor: COLORS.bgCard,
          paddingTop: 8,
          paddingBottom: 4,
        }}
        backgroundStyle={{
          backgroundColor: COLORS.bgWhite,
          borderTopLeftRadius: BORDER_RADIUS.lg,
          borderTopRightRadius: BORDER_RADIUS.lg,
        }}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustPan"
        topInset={insets.top}
        bottomInset={insets.bottom}
        onDismiss={() => {
          abortControllerRef.current?.abort();
          setComments([]);
          setCommentCount(0);
          setFetchError(null);
          setLoading(false);
          setPostId(null);

          const username = pendingProfileNavigationRef.current;
          pendingProfileNavigationRef.current = null;
          if (username) {
            requestAnimationFrame(() => router.push(`/user/${username}`));
          }
        }}
      >
        <View style={styles.sheetContent}>
          <View
            style={[
              styles.header,
              {
                paddingLeft: SPACING.md + insets.left,
                paddingRight: SPACING.md + insets.right,
              },
            ]}
          >
            <View style={styles.headerCenter}>
              <Text
                style={[
                  styles.headerTitle,
                  isCompact && styles.headerTitleCompact,
                ]}
              >
                Comments
              </Text>
              <Text style={styles.headerCount}>
                {commentCount} {commentCount === 1 ? "comment" : "comments"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={close}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close comments"
            >
              <Ionicons name="close" size={24} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>

          <BottomSheetFlatList
            data={commentThreads}
            keyExtractor={(item) => item.comment.id}
            renderItem={renderItem}
            ListEmptyComponent={ListEmptyComponent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={false}
            contentInsetAdjustmentBehavior="never"
            enableFooterMarginAdjustment
            style={styles.listWrapper}
            contentContainerStyle={[
              commentThreads.length === 0 ? styles.emptyListContent : styles.listContent,
              {
                paddingLeft: horizontalPadding + insets.left,
                paddingRight: horizontalPadding + insets.right,
              },
            ]}
          />
        </View>
      </BottomSheetModal>
    );
  },
);

CommentBottomSheet.displayName = "CommentBottomSheet";

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
    backgroundColor: COLORS.bgWhite,
    flexDirection: "column",
    minHeight: 0,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderDivider,
    backgroundColor: COLORS.bgWhite,
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginLeft: 28,
  },

  headerTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl6,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
  },

  headerTitleCompact: {
    fontSize: TYPOGRAPHY.fontSize.xl5,
  },

  headerCount: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textMuted,
  },

  closeButton: {
    padding: 4,
  },

  listWrapper: {
    flex: 1,
    minHeight: 0,
  },

  listContent: {
    paddingTop: SPACING.sm,
  },

  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  commentItem: {
    flexDirection: "row",
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },

  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
  },

  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },

  commentBody: {
    flex: 1,
    minWidth: 0,
  },

  authorName: {
    fontWeight: "600",
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.md,
  },

  youBadge: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },

  commentText: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    lineHeight: TYPOGRAPHY.lineHeight.xl,
  },

  commentTime: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  stateContainer: {
    alignItems: "center",
    paddingVertical: SPACING.xxxxl,
  },

  stateText: {
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    fontSize: TYPOGRAPHY.fontSize.xl,
  },

  stateSubtext: {
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },

  retryButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primaryGhost,
    borderRadius: BORDER_RADIUS.full,
  },

  retryButtonText: {
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },

  footer: {
    backgroundColor: COLORS.bgWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderDivider,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },

  inputContainer: {
    paddingTop: 10,
    paddingBottom: 10,
    flexShrink: 0,
  },

  replyingPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
    marginLeft: 46,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgLight,
  },

  replyingPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },

  replyingPreviewTitle: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },

  replyingPreviewText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginTop: 1,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
  },

  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },

  userAvatarImage: {
    width: "100%",
    height: "100%",
  },

  userAvatarText: {
    color: COLORS.textWhite,
    fontSize: TYPOGRAPHY.fontSize.xl6,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },

  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    maxHeight: 88,
    backgroundColor: COLORS.bgInput,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
  },

  inputCompact: {
    paddingHorizontal: 14,
    fontSize: TYPOGRAPHY.fontSize.md,
  },

  postButton: {
    minWidth: 39,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  postButtonDisabled: {
    opacity: 0.4,
  },
});
