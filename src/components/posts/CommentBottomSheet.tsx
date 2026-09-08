import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
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
import theme from "@/constants/theme";

/* =========================================================
   REF
========================================================= */

export interface CommentBottomSheetRef {
  open: (postId: string) => void;
  close: () => void;
}

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
    const [postId, setPostId] = useState<string | null>(null);

    const [comments, setComments] = useState<Comment[]>([]);

    const [loading, setLoading] = useState(false);

    const [input, setInput] = useState("");

    const [sending, setSending] = useState(false);

    const [fetchError, setFetchError] = useState<string | null>(null);

    const [commentCount, setCommentCount] = useState(0);

    const token = useAppSelector((s) => s.auth.token);

    const currentUserId = useAppSelector((s) => s.auth.user?.id);

    const bottomSheetRef = React.useRef<BottomSheetModal>(null);

    const abortControllerRef = React.useRef<AbortController | null>(null);

    /* =====================================================
         SNAP POINTS
      ===================================================== */

    const snapPoints = useMemo(() => ["70%", "90%"], []);

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

        /*
         * Keep keyboard open after sending.
         * This feels much better for consecutive comments.
         */
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

        bottomSheetRef.current?.present();

        fetchComments(pid);
      },
      [fetchComments],
    );

    /* =====================================================
         CLOSE
      ===================================================== */

    const close = useCallback(() => {
      abortControllerRef.current?.abort();

      Keyboard.dismiss();

      bottomSheetRef.current?.dismiss();
    }, []);

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
          backgroundColor: theme.COLORS.borderGray,
          width: 36,
        }}
        handleStyle={{
          backgroundColor: theme.COLORS.bgLight,
          paddingTop: 12,
        }}
        backgroundStyle={{
          backgroundColor: theme.COLORS.bgLight,
        }}
        /*
         * Important:
         * Let Gorhom handle the keyboard.
         */
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        bottomInset={Platform.OS === "ios" ? 20 : 16}
        onDismiss={() => {
          abortControllerRef.current?.abort();

          setComments([]);
          setCommentCount(0);
          setInput("");
          setPostId(null);
        }}
>
        <View style={styles.sheetContent}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              Comments
              {commentCount > 0 && (
                <Text style={styles.headerCount}> {commentCount}</Text>
              )}
            </Text>

            <TouchableOpacity
              onPress={close}
              hitSlop={{
                top: 8,
                bottom: 8,
                left: 8,
                right: 8,
              }}
            >
              <Ionicons
                name="close"
                size={24}
                color={theme.COLORS.textPrimary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.listWrapper}>
            <BottomSheetFlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ListEmptyComponent={ListEmptyComponent}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={
                comments.length === 0
                  ? styles.emptyListContent
                  : styles.listContent
              }
            />
          </View>
        </View>

        {/*
         * =========================================================
         * INPUT
         *
         * SIBLING of the sheet content, positioned absolute at
         * the SCREEN BOTTOM. Gorhom's BottomSheetModal renders
         * children in a relative container, so this input NEVER
         * moves when the sheet resizes, scrolls, or changes
         * snap points.
         * =========================================================
         */}
        <SafeAreaView
          edges={["bottom"]}
          style={styles.pinnedInput}
        >
          <View style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Add a comment..."
                placeholderTextColor={theme.COLORS.textMuted}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                editable={!sending}
                multiline
                maxLength={1000}
                textAlignVertical="top"
                blurOnSubmit={false}
              />

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!input.trim() || sending) && styles.sendBtnDisabled,
                ]}
                onPress={handleSend}
                disabled={!input.trim() || sending}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={theme.COLORS.white} />
                ) : (
                  <Ionicons name="send" size={18} color={theme.COLORS.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </BottomSheetModal>
    );
  },
);

CommentBottomSheet.displayName = "CommentBottomSheet";

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  /* =======================================================
     SHEET CONTENT
     Plain View (NOT BottomSheetView) — BottomSheetView
     uses position: absolute internally and would cover the
     sibling input bar. A plain View keeps the input visible.
   ======================================================= */

  sheetContent: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
    flexDirection: "column",
    minHeight: 0,
  },

  /* =======================================================
     INPUT — pinned to SCREEN BOTTOM
     SIBLING of the sheet content. Gorhom's BottomSheetModal
     positions children in a relative container, so this input
     NEVER moves when the sheet resizes, scrolls, or changes
     snap points.
   ======================================================= */

  pinnedInput: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.borderDivider,
    /*
     * On top of the sheet content.
     */
    zIndex: 10,
    /*
     * Never let the input be squeezed.
     */
    flexShrink: 0,
  },

  /* =======================================================
     HEADER
  ======================================================= */

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

  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,

    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,

    color: theme.COLORS.textPrimary,
  },

  headerCount: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,

    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,

    color: theme.COLORS.textMuted,
  },

  /* =======================================================
     LIST
  ======================================================= */

  listWrapper: {
    flex: 1,
    /*
     * Allow the list to shrink below its content height
     * so the input always has room at the bottom.
     */
    minHeight: 0,
  },

  listContent: {
    paddingHorizontal: theme.SPACING.sm,

    paddingTop: theme.SPACING.sm,

    /*
     * Enough bottom padding so the last comment isn't hidden
     * behind the absolutely-positioned input bar.
     */
    paddingBottom: 90,
  },

  emptyListContent: {
    flexGrow: 1,

    paddingHorizontal: theme.SPACING.sm,

    justifyContent: "center",
  },

  /* =======================================================
     COMMENT
  ======================================================= */

  commentItem: {
    flexDirection: "row",

    paddingVertical: theme.SPACING.sm,

    gap: theme.SPACING.sm,
  },

  avatarContainer: {
    width: 32,
    height: 32,

    borderRadius: 16,

    backgroundColor: theme.COLORS.bgInput,

    alignItems: "center",
    justifyContent: "center",

    flexShrink: 0,
  },

  avatarText: {
    fontSize: 12,

    fontWeight: "700",

    color: theme.COLORS.primary,
  },

  commentBody: {
    flex: 1,
    minWidth: 0,
  },

  authorName: {
    fontWeight: "600",

    color: theme.COLORS.textPrimary,

    fontSize: theme.TYPOGRAPHY.fontSize.md,

    marginBottom: 2,
  },

  youBadge: {
    color: theme.COLORS.primary,

    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },

  commentText: {
    color: theme.COLORS.textPrimary,

    fontSize: theme.TYPOGRAPHY.fontSize.xl,

    lineHeight: theme.TYPOGRAPHY.lineHeight.xl,
  },

  commentTime: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,

    color: theme.COLORS.textMuted,

    marginTop: 4,
  },

  /* =======================================================
     EMPTY / LOADING
  ======================================================= */

  stateContainer: {
    alignItems: "center",

    paddingVertical: theme.SPACING.xxxxl,
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

  retryButton: {
    marginTop: theme.SPACING.md,

    paddingHorizontal: theme.SPACING.lg,

    paddingVertical: theme.SPACING.sm,

    backgroundColor: theme.COLORS.primaryGhost,

    borderRadius: theme.BORDER_RADIUS.full,
  },

  retryButtonText: {
    color: theme.COLORS.primary,

    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,

    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },

  /* =======================================================
     INPUT
  ======================================================= */

  inputContainer: {
    backgroundColor: theme.COLORS.bgWhite,

    borderTopWidth: 1,

    borderTopColor: theme.COLORS.borderDivider,

    paddingHorizontal: theme.SPACING.md,

    paddingTop: theme.SPACING.sm,

    paddingBottom: Platform.OS === "ios" ? theme.SPACING.sm : theme.SPACING.sm,

    /*
     * CRITICAL: never let the input be squeezed.
     * It must always stay at the bottom of the sheet.
     */
    flexShrink: 0,
  },

inputSafeArea: {
    backgroundColor: theme.COLORS.bgWhite,

    borderTopWidth: 1,

    borderTopColor: theme.COLORS.borderDivider,

    /*
     * CRITICAL: absolute positioning pins the input to the
     * BOTTOM of the sheet, so it never moves when the sheet
     * resizes, scrolls, or changes snap points.
     */
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,

    /*
     * Never let the input be squeezed.
     */
    flexShrink: 0,

    /*
     * SafeAreaView already adds the bottom inset, so keep
     * this container's own padding minimal.
     */
    paddingTop: theme.SPACING.sm,
    paddingBottom: 0,
  },

  keyboardAvoid: {
    flex: 1,
  },

  inputRow: {
    flexDirection: "row",

    alignItems: "flex-end",

    gap: theme.SPACING.sm,
  },

  input: {
    flex: 1,

    minHeight: 40,

    maxHeight: 120,

    backgroundColor: theme.COLORS.bgAuthInput,

    borderRadius: theme.BORDER_RADIUS.xxxxxxl,

    paddingHorizontal: theme.SPACING.lg,

    paddingVertical: theme.SPACING.md,

    fontSize: theme.TYPOGRAPHY.fontSize.xl,

    color: theme.COLORS.textPrimary,

    textAlignVertical: "top",
  },

  sendBtn: {
    width: 40,
    height: 40,

    borderRadius: 20,

    backgroundColor: theme.COLORS.primary,

    alignItems: "center",
    justifyContent: "center",
  },

  sendBtnDisabled: {
    backgroundColor: theme.COLORS.textMuted,
  },
});
