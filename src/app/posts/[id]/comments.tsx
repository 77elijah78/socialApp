import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAppSelector } from "@/store/hooks";
import { api } from "@/services/api";
import { PostOneResponse, Comment } from "@/types";
import theme from "@/constants/theme";

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
          backgroundColor: theme.COLORS.bgLight,
          marginRight: theme.SPACING.sm,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.sm, fontWeight: "600" }}>
          {authorName?.[0]?.toUpperCase() ?? "?"}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "600", fontSize: theme.TYPOGRAPHY.fontSize.sm }}>
          {authorName}
        </Text>
        <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.lg, color: theme.COLORS.textPrimary, marginTop: 2 }}>
          {comment.content}
        </Text>
        <Text style={{ fontSize: theme.TYPOGRAPHY.fontSize.xs, color: theme.COLORS.textMuted, marginTop: 2 }}>
          {createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

export default function CommentsScreen() {
  const { id: postId } = useLocalSearchParams<{ id: string }>();
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");

  const fetchComments = useCallback(async () => {
    if (!token || !postId) return [];
    try {
      const resp = await api.get<{
        success: boolean;
        data: PostOneResponse;
      }>(`/posts/${postId}`, token);
      return resp.data.comments ?? [];
    } catch (err) {
      console.error("Failed to fetch comments:", err);
      return [];
    }
  }, [token, postId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!token || !postId) return;
      setLoading(true);
      try {
        const data = await fetchComments();
        if (!cancelled) {
          setComments(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchComments, token, postId]);

  const handleSend = async () => {
    if (!input.trim() || !token || !postId || sending) return;
    setSending(true);
    try {
      const resp = await api.post<{
        success: boolean;
        data: Comment;
      }>(
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

  const renderItem = ({ item }: { item: Comment }) => (
    <CommentItem comment={item} isOwn={item.author?.id === currentUserId} />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={theme.COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comments</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={theme.COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
        />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  backBtn: {
    padding: 4,
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
    backgroundColor: theme.COLORS.textMutedGray,
  },
});

