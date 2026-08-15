import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { router } from "expo-router";
import { Comment, PostOneResponse } from "@/types";
import theme from "@/constants/theme";

export interface CommentBottomSheetRef {
  open: (postId: string) => void;
  close: () => void;
}

interface CommentItemProps {
  comment: Comment;
  isOwn: boolean;
}

function CommentItem({ comment, isOwn }: CommentItemProps) {
  const authorName = comment.author?.username ?? comment.author?.displayName ?? "Unknown";
  const createdAt = new Date(comment.createdAt);

  return (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: theme.SPACING.md,
        paddingVertical: theme.SPACING.sm,
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: theme.COLORS.bgInput,
          alignItems: "center",
          justifyContent: "center",
          marginRight: theme.SPACING.sm,
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: "700", color: theme.COLORS.primary }}>
          {(authorName || "?").charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <TouchableOpacity onPress={() => comment.author?.username && router.push(`/user/${comment.author.username}`)}>
          <Text style={{ fontWeight: "600", color: theme.COLORS.textPrimary, marginBottom: 2 }}>
            {authorName} {isOwn && <Text style={{ color: theme.COLORS.primary }}>(you)</Text>}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: theme.COLORS.textPrimary, fontSize: 14, lineHeight: 20 }}>
          {comment.content}
        </Text>
        <Text style={{ fontSize: 11, color: theme.COLORS.textMuted, marginTop: 4 }}>
          {createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

export const CommentBottomSheet = React.forwardRef<CommentBottomSheetRef>((_, ref) => {
  const [postId, setPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);

  const bottomSheetRef = React.useRef<BottomSheetModal>(null);

  const fetchComments = useCallback(async (pid: string) => {
    if (!token) return;
    setLoading(true);
    try {
       const resp = await api.get<{
        success: boolean;
        data: PostOneResponse;
      }>(`/posts/${pid}`, token);
      setComments(resp.data.comments ?? []);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleSend = async () => {
    if (!input.trim() || !token || !postId || sending) return;
    setSending(true);
    try {
      const resp = await api.post<{ success: boolean; data: Comment }>(
        `/posts/${postId}/comments`,
        { content: input.trim() },
        token,
      );
      setComments((prev) => [...prev, resp.data]);
      setInput("");
    } catch (err) {
      console.error("Failed to send comment:", err);
    } finally {
      setSending(false);
    }
  };

  const open = useCallback((pid: string) => {
    setPostId(pid);
    fetchComments(pid);
    bottomSheetRef.current?.present();
  }, [fetchComments]);

  const close = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  React.useImperativeHandle(ref, () => ({ open, close }));

  const snapPoints = useMemo(() => ["50%", "80%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnDemand
        onPress={close}
        enablePanThroughBackdrop
      />
    ),
    [close],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableOverDrag
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: theme.COLORS.borderGray }}
      handleStyle={{ backgroundColor: theme.COLORS.bgLight }}
      backgroundStyle={{ backgroundColor: theme.COLORS.bgLight }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.sheetContainer}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Comments</Text>
            <TouchableOpacity onPress={close}>
              <Ionicons name="close" size={24} color={theme.COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={theme.COLORS.primary} />
            </View>
          ) : (
            <BottomSheetScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 80 }}
              showsVerticalScrollIndicator={false}
            >
              {comments.map((item) => (
                <CommentItem key={item.id} comment={item} isOwn={item.author?.id === currentUserId} />
              ))}
            </BottomSheetScrollView>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Add a comment..."
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={theme.COLORS.white} />
              ) : (
                <Ionicons name="send" size={20} color={theme.COLORS.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </BottomSheetModal>
  );
});

CommentBottomSheet.displayName = "CommentBottomSheet";

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: theme.COLORS.borderGray,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    marginTop: 8,
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
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: "600",
    color: theme.COLORS.textPrimary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.borderDivider,
  },
  input: {
    flex: 1,
    backgroundColor: theme.COLORS.bgAuthInput,
    borderRadius: theme.BORDER_RADIUS.full,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
  },
  sendBtn: {
    marginLeft: theme.SPACING.sm,
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
