import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";

import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { router } from "expo-router";
import { Comment, PostOneResponse } from "@/types";
import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

export interface CommentBottomSheetRef {
  open: (postId: string) => void;
  close: () => void;
}

interface CommentItemProps {
  comment: Comment;
  isOwn: boolean;
}

function CommentItem({ comment, isOwn }: CommentItemProps) {
  const authorName =
    comment.author?.username ?? comment.author?.displayName ?? "Unknown";

  const createdAt = useMemo(
    () => new Date(comment.createdAt),
    [comment.createdAt],
  );

  const timeLabel = useMemo(() => {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return createdAt.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }, [createdAt]);

  return (
    <View style={styles.commentItem}>
      <View style={styles.avatarContainer}>
        {comment.author?.avatarUrl ? (
          <Image
            source={{ uri: comment.author.avatarUrl }}
            style={styles.avatarImage}
          />
        ) : (
          <Text style={styles.avatarText}>
            {(authorName || "?").charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.commentBody}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (comment.author?.username) {
              router.push(`/user/${comment.author.username}`);
            }
          }}
        >
          <Text style={styles.authorName}>
            {authorName}
            {isOwn && <Text style={styles.youBadge}> (you)</Text>}
          </Text>
        </TouchableOpacity>

        <Text style={styles.commentText}>{comment.content}</Text>
        <Text style={styles.commentTime}>{timeLabel}</Text>
      </View>
    </View>
  );
}

export const CommentBottomSheet = React.forwardRef<CommentBottomSheetRef>(
  (_, ref) => {
    const { width: screenWidth } = useWindowDimensions();
    const keyboardIsVisible = useKeyboardState((state) => state.isVisible);
    const isCompact = screenWidth < 375;
    const horizontalPadding = Math.max(14, Math.min(24, screenWidth * 0.045));

    const [postId, setPostId] = useState<string | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(false);
    const [input, setInput] = useState("");
    const [inputHeight, setInputHeight] = useState(44);
    const [sending, setSending] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [commentCount, setCommentCount] = useState(0);
    const [currentSnapIndex, setCurrentSnapIndex] = useState(0);

    const token = useAppSelector((s) => s.auth.token);
    const currentUser = useAppSelector((s) => s.auth.user);
    const currentUserId = currentUser?.id;
    const currentUserAvatarUrl = currentUser?.avatarUrl;
    const currentUserInitial = (
      currentUser?.displayName ||
      currentUser?.username ||
      "You"
    )
      .charAt(0)
      .toUpperCase();

    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [keyboardHeight] = useState(() => new Animated.Value(0));

    React.useEffect(() => {
      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      const showSubscription = Keyboard.addListener(showEvent, (event) => {
        Animated.timing(keyboardHeight, {
          toValue: event.endCoordinates.height,
          duration: event.duration ?? 250,
          useNativeDriver: true,
        }).start();
      });

      const hideSubscription = Keyboard.addListener(hideEvent, (event) => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: event.duration ?? 250,
          useNativeDriver: true,
        }).start();
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }, [keyboardHeight]);

    const inputTranslateY = keyboardHeight.interpolate({
      inputRange: [0, 400],
      outputRange: [0, -420],
      extrapolate: "clamp",
    });

    // Keep the sheet at its current detent while typing; the composer moves
    // above the keyboard without expanding the sheet to a larger snap point.
    const allSnapPoints = useMemo(() => ["66%", "92%"], []);
    const snapPoints = useMemo(
      () =>
        keyboardIsVisible && currentSnapIndex === 0
          ? [allSnapPoints[0]]
          : allSnapPoints,
      [allSnapPoints, currentSnapIndex, keyboardIsVisible],
    );

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
          setCommentCount(fetched.length);
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

    const handleSend = useCallback(async () => {
      const trimmed = input.trim();
      if (!trimmed || !token || !postId || sending) return;

      setSending(true);
      try {
        const resp = await api.post<{
          success: boolean;
          data: Comment;
        }>(
          `/posts/${postId}/comments`,
          { content: trimmed },
          token,
        );

        setComments((previous) => [...previous, resp.data]);
        setCommentCount((previous) => previous + 1);
        setInput("");
        setInputHeight(44);
      } catch (err) {
        console.error("Failed to send comment:", err);
      } finally {
        setSending(false);
      }
    }, [input, token, postId, sending]);

    const handleSheetChange = useCallback(
      (index: number) => {
        if (index >= 0 && !keyboardIsVisible) setCurrentSnapIndex(index);
      },
      [keyboardIsVisible],
    );

    const open = useCallback(
      (pid: string) => {
        setPostId(pid);
        setComments([]);
        setCommentCount(0);
        setInput("");
        setInputHeight(44);
        setSending(false);
        setCurrentSnapIndex(0);
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

    React.useImperativeHandle(
      ref,
      () => ({ open, close }),
      [open, close],
    );

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
      ({ item }: { item: Comment }) => (
        <CommentItem comment={item} isOwn={item.author?.id === currentUserId} />
      ),
      [currentUserId],
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

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        enableOverDrag={false}
        backdropComponent={renderBackdrop}
        onChange={handleSheetChange}
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
        android_keyboardInputMode="adjustResize"
        bottomInset={0}
        onDismiss={() => {
          abortControllerRef.current?.abort();
          setComments([]);
          setCommentCount(0);
          setInput("");
          setInputHeight(44);
          setSending(false);
          setCurrentSnapIndex(0);
          setFetchError(null);
          setLoading(false);
          setPostId(null);
        }}
      >
        <View style={styles.sheetContent}>
          <View style={styles.header}>
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
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={ListEmptyComponent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            style={styles.listWrapper}
            contentContainerStyle={
              comments.length === 0
                ? [styles.emptyListContent, { paddingHorizontal: horizontalPadding }]
                : [styles.listContent, { paddingHorizontal: horizontalPadding }]
            }
          />

          <Animated.View
            style={[
              styles.footer,
              { transform: [{ translateY: inputTranslateY }] },
            ]}
          >
            <View
              style={[
                styles.inputContainer,
                { paddingHorizontal: horizontalPadding },
              ]}
            >
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
                  placeholder="Add a comment..."
                  placeholderTextColor={COLORS.textMuted}
                  value={input}
                  onChangeText={setInput}
                  onContentSizeChange={(event) => {
                    const nextHeight = Math.min(
                      88,
                      Math.max(44, event.nativeEvent.contentSize.height),
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
                  accessibilityLabel="Post comment"
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="send" size={18} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
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
