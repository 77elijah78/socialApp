import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";

import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { router } from "expo-router";
import { Comment, PostOneResponse } from "@/types";
import theme, { BORDER_RADIUS, COLORS } from "@/constants/theme";

/* =========================================================
   REF
========================================================= */

export interface CommentBottomSheetRef {
  open: (postId: string) => void;
  close: () => void;
}

/* =========================================================
   RESPONSIVE SCALING
   Scale based on screen width relative to a reference
   (393px = iPhone 15 Pro width).
========================================================= */

const REFERENCE_WIDTH = 393;

/* =========================================================
   COMMENT ITEM
========================================================= */

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
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarText}>
          {(authorName || "?").charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Body */}
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

/* =========================================================
   COMMENT BOTTOM SHEET
========================================================= */

export const CommentBottomSheet = React.forwardRef<CommentBottomSheetRef>(
  (_, ref) => {
    const { width: screenWidth } = useWindowDimensions();
    const isCompact = screenWidth < 375;
    const horizontalPadding = Math.max(14, Math.min(24, screenWidth * 0.045));

    const [postId, setPostId] = useState<string | null>(null);

    const [comments, setComments] = useState<Comment[]>([]);

    const [loading, setLoading] = useState(false);

    const [input, setInput] = useState("");

    const [sending, setSending] = useState(false);

    const [fetchError, setFetchError] = useState<string | null>(null);

    const [commentCount, setCommentCount] = useState(0);

    const [isOpen, setIsOpen] = useState(false);

    const [showInput, setShowInput] = useState(false);

    const inputFadeAnim = useRef(new Animated.Value(0)).current;

    const keyboardHeight = useRef(new Animated.Value(0)).current;

    const token = useAppSelector((s) => s.auth.token);

    const currentUserId = useAppSelector((s) => s.auth.user?.id);

    const bottomSheetRef = React.useRef<BottomSheetModal>(null);

    const abortControllerRef = React.useRef<AbortController | null>(null);

    /* =====================================================
           SNAP POINTS
       ===================================================== */

    const snapPoints = useMemo(() => ["92%"], []);

    /* =====================================================
           KEYBOARD LISTENERS
        ===================================================== */

    useEffect(() => {
      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      const showSub = Keyboard.addListener(showEvent, (e) => {
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: e.duration ?? 250,
          useNativeDriver: true,
        }).start();
      });

      const hideSub = Keyboard.addListener(hideEvent, (e) => {
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: e.duration ?? 250,
          useNativeDriver: true,
        }).start();
      });

      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, [keyboardHeight]);

    const inputTranslateY = keyboardHeight.interpolate({
      inputRange: [0, 400],
      outputRange: [0, -420],
      extrapolate: "clamp",
    });

    /* =====================================================
           FETCH COMMENTS
       ===================================================== */

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
          if ((err as any)?.name !== "AbortError") {
            setFetchError(
              err instanceof Error ? err.message : "Failed to load comments",
            );
          }
        } finally {
          if (abortControllerRef.current === controller) {
            abortControllerRef.current = null;
          }

          setLoading(false);
        }
      },
      [token],
    );

    /* =====================================================
           SEND COMMENT
       ===================================================== */

    const handleSend = useCallback(async () => {
      const trimmed = input.trim();

      if (!trimmed || !token || !postId || sending) {
        return;
      }

      setSending(true);

      try {
        const resp = await api.post<{
          success: boolean;
          data: Comment;
        }>(
          `/posts/${postId}/comments`,
          {
            content: trimmed,
          },
          token,
        );

        setComments((prev) => [...prev, resp.data]);

        setCommentCount((prev) => prev + 1);

        setInput("");
      } catch (err) {
        console.error("Failed to send comment:", err);
      } finally {
        setSending(false);
      }
    }, [input, token, postId, sending]);

    /* =====================================================
           OPEN
       ===================================================== */

    const open = useCallback(
      (pid: string) => {
        setPostId(pid);
        setComments([]);
        setCommentCount(0);
        setInput("");
        setFetchError(null);
        setIsOpen(true);

        bottomSheetRef.current?.present();

        // Instagram-style: input appears ~200ms after sheet opens
        setTimeout(() => {
          setShowInput(true);
          Animated.timing(inputFadeAnim, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }, 200);

        fetchComments(pid);
      },
      [fetchComments, inputFadeAnim],
    );

    /* =====================================================
           CLOSE
       ===================================================== */

    const close = useCallback(() => {
      setShowInput(false);
      setIsOpen(false);

      Animated.timing(inputFadeAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();

      abortControllerRef.current?.abort();
      Keyboard.dismiss();
      bottomSheetRef.current?.dismiss();
    }, [inputFadeAnim]);

    /* =====================================================
           IMPERATIVE HANDLE
       ===================================================== */

    React.useImperativeHandle(
      ref,
      () => ({
        open,
        close,
      }),
      [open, close],
    );

    /* =====================================================
           BACKDROP
       ===================================================== */

    const renderBackdrop = useCallback(
      (props: any) => (
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

    /* =====================================================
           COMMENT ITEM
       ===================================================== */

    const renderItem = useCallback(
      ({ item }: { item: Comment }) => (
        <CommentItem comment={item} isOwn={item.author?.id === currentUserId} />
      ),
      [currentUserId],
    );

    /* =====================================================
           EMPTY STATE
       ===================================================== */

    const ListEmptyComponent = useCallback(() => {
      if (loading) {
        return (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={theme.COLORS.primary} />

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
              color={theme.COLORS.textMuted}
            />

            <Text style={styles.stateText}>{fetchError}</Text>

            <TouchableOpacity
              onPress={() => postId && fetchComments(postId)}
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
            color={theme.COLORS.textMuted}
          />

          <Text style={styles.stateText}>No comments yet</Text>

          <Text style={styles.stateSubtext}>Be the first to comment</Text>
        </View>
      );
    }, [loading, fetchError, postId, fetchComments]);

    /* =====================================================
           RENDER
       ===================================================== */

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableOverDrag={false}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: COLORS.borderGray,
          width: 36,
        }}
        handleStyle={{
          backgroundColor: COLORS.bgCard,
          paddingTop: 12,
        }}
        backgroundStyle={{
          backgroundColor: COLORS.bgCard,
          borderTopLeftRadius: BORDER_RADIUS.lg,
          borderTopRightRadius: BORDER_RADIUS.lg,
        }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        bottomInset={0}
        onChange={(index) => {
          if (index < 0) {
            setShowInput(false);
            setIsOpen(false);

            Animated.timing(inputFadeAnim, {
              toValue: 0,
              duration: 150,
              easing:Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }
        }}
        onDismiss={() => {
          abortControllerRef.current?.abort();
          setShowInput(false);
          setIsOpen(false);

          Animated.timing(inputFadeAnim, {
            toValue: 0,
            duration: 150,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start();

          setComments([]);
          setCommentCount(0);
          setInput("");
          setPostId(null);
        }}
      >
        <View style={styles.sheetContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.pullBar} />

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
            >
              <Ionicons name="close" size={24} color={COLORS.textDark} />
            </TouchableOpacity>
          </View>

          {/* List */}
          <View style={styles.listWrapper}>
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
                  ? styles.emptyListContent
                  : [
                      styles.listContent,
                      { paddingHorizontal: horizontalPadding, paddingBottom: 80 },
                    ]
              }
            />
          </View>

          {/*
           * =========================================================
           * INPUT BAR — floating inside sheet, lifts above keyboard
           * =========================================================
           */}
          {showInput && (
            <Animated.View
              style={[
                styles.floatingInputWrapper,
                {
                  opacity: inputFadeAnim,
                  transform: [{ translateY: inputTranslateY }],
                },
              ]}
              pointerEvents="box-none"
            >
              <SafeAreaView edges={["bottom"]}>
                <View
                  style={[
                    styles.inputContainer,
                    { paddingHorizontal: horizontalPadding },
                  ]}
                >
                  <View style={styles.inputRow}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>E</Text>
                    </View>

                    <TextInput
                      style={[styles.input, isCompact && styles.inputCompact]}
                      placeholder="Add a comment..."
                      placeholderTextColor={COLORS.textMuted}
                      value={input}
                      onChangeText={setInput}
                      onSubmitEditing={handleSend}
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
                      onPress={handleSend}
                      disabled={!input.trim() || sending}
                      activeOpacity={0.8}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Ionicons name="send" size={18} color={COLORS.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </SafeAreaView>
            </Animated.View>
          )}
        </View>
      </BottomSheetModal>
    );
  },
);

CommentBottomSheet.displayName = "CommentBottomSheet";

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  /* =========================================================
   * SHEET CONTENT
   * ========================================================= */
  sheetContent: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    flexDirection: "column",
    minHeight: 0,
  },

  /* =========================================================
   * HEADER
   * ========================================================= */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderDivider,
    backgroundColor: COLORS.bgWhite,
  },

  pullBar: {
    position: "absolute",
    top: 9,
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderGray,
    opacity: 0.35,
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
  },

  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
  },

  headerTitleCompact: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
  },

  headerCount: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: COLORS.textMuted,
  },

  closeButton: {
    padding: 4,
  },

  /* =========================================================
   * LIST
   * ========================================================= */
  listWrapper: {
    flex: 1,
    minHeight: 0,
  },

  listContent: {
    paddingTop: theme.SPACING.sm,
    paddingBottom: 90,
  },

  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  /* =========================================================
   * COMMENT ITEM
   * ========================================================= */
  commentItem: {
    flexDirection: "row",
    paddingVertical: theme.SPACING.sm,
    gap: theme.SPACING.sm,
  },

  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },

  youBadge: {
    color: COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },

  commentText: {
    color: COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
  },

  commentTime: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  /* =========================================================
   * EMPTY / LOADING / ERROR STATES
   * ========================================================= */
  stateContainer: {
    alignItems: "center",
    paddingVertical: theme.SPACING.xxxxl,
  },

  stateText: {
    color: COLORS.textMuted,
    marginTop: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
  },

  stateSubtext: {
    color: COLORS.textMuted,
    marginTop: theme.SPACING.xs,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },

  retryButton: {
    marginTop: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: COLORS.primaryGhost,
    borderRadius: theme.BORDER_RADIUS.full,
  },

  retryButtonText: {
    color: COLORS.primary,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },

  /* =========================================================
   * FLOATING INPUT BAR
   * ========================================================= */
  floatingInputWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
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
    paddingVertical: 10,
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
    flexShrink: 0,
  },

  userAvatarText: {
    color: COLORS.textWhite,
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },

  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    maxHeight: 88,
    backgroundColor: COLORS.bgInput,
    borderRadius: theme.BORDER_RADIUS.full,
    paddingHorizontal: 16,
    paddingVertical: 0,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
  },

  inputCompact: {
    paddingHorizontal: 14,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
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
