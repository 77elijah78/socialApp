import {
  memo,
  useCallback,
  useEffect,
  useState,
  useLayoutEffect,
  useRef,
} from "react";
import { Animated, View, Text, StyleSheet, Pressable } from "react-native";
import type { MessageRow } from "@/db/schema";
import type { ChatListItem } from "@/utils/messaging/listItems";
import { authorName, messageMetadata } from "@/utils/messaging/presentation";
import {
  BORDER_RADIUS,
  COLORS,
  LAYOUT,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import MessageCard from "../messages/MessageCard";
import ReplyContext from "./ReplyContext";
import SwipeToReply from "./SwipeToReply";
import { canReplyToMessage } from "@/utils/messaging/actions";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  item: ChatListItem;
  userId: string;
  receiverName: string;
  isGroup?: boolean;
  onAction: (message: MessageRow) => void;
  onRetry: (message: MessageRow) => void;
  onReply?: (message: MessageRow) => void;
  selectionMode?: boolean;
  selected?: boolean;
  interactionDisabled?: boolean;
  onNavigate: (id: string, context?: boolean) => void;
  onContextClose: () => void;
  onContextPage: (page: number) => void;
  onContextRefresh: () => void;
  highlight?: number;
}
function Highlight({ token }: { token: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    opacity.setValue(OPACITY.light);
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 1600,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity, token]);
  return (
    <Animated.View
      testID="message-navigation-highlight"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.highlight, { opacity }]}
    />
  );
}
function ChatMessageRow({
  item,
  userId,
  receiverName,
  isGroup = false,
  onAction,
  onRetry,
  onReply,
  selectionMode = false,
  selected = false,
  interactionDisabled = false,
  onNavigate,
  onContextClose,
  onContextPage,
  onContextRefresh,
  highlight = 0,
}: Props) {
  const message = item.kind === "message" ? item.message : null;
  const latest = useRef(message);
  useLayoutEffect(() => {
    latest.current = message;
  }, [message]);
  const action = useCallback(() => {
    if (latest.current) onAction(latest.current);
  }, [onAction]);
  const reply = useCallback(() => {
    if (latest.current && !selectionMode && !interactionDisabled)
      onReply?.(latest.current);
  }, [selectionMode, interactionDisabled, onReply]);
  const retry = useCallback(() => {
    if (latest.current) onRetry(latest.current);
  }, [onRetry]);
  if (item.kind === "date")
    return (
      <View style={styles.date}>
        <Text style={styles.dateText}>{item.label}</Text>
      </View>
    );
  if (item.kind === "unread")
    return (
      <View style={styles.unread}>
        <View style={styles.line} />
        <Text style={styles.unreadText}>New messages</Text>
        <View style={styles.line} />
      </View>
    );
  if (item.kind === "reply-context")
    return (
      <View pointerEvents={selectionMode ? "none" : "auto"}>
        <ReplyContext
          item={item}
          userId={userId}
          onNavigate={onNavigate}
          onClose={onContextClose}
          onPage={onContextPage}
          onRefresh={onContextRefresh}
        />
      </View>
    );
  const row = item.message,
    own = row.senderId === userId,
    metadata = messageMetadata(row);
  return (
    <View style={styles.message}>
      <SwipeToReply
        enabled={Boolean(
          onReply &&
            canReplyToMessage(row) &&
            !selectionMode &&
            !interactionDisabled,
        )}
        onReply={reply}
      >
        <View
          pointerEvents={selectionMode ? "none" : "auto"}
          accessibilityElementsHidden={selectionMode}
          importantForAccessibility={
            selectionMode ? "no-hide-descendants" : "auto"
          }
        >
          <MessageCard
            message={row.content}
            time={row.timestamp}
            sender={authorName(
              metadata.author,
              own ? "You" : isGroup ? "Unknown sender" : receiverName,
            )}
            senderAvatar={metadata.author?.avatarUrl}
            showAuthor={isGroup}
            ownerId={userId}
            isRead={row.isRead || row.status === "READ"}
            isSent={own}
            status={row.status}
            type={row.type}
            uri={row.mediaUrl ?? ""}
            thumbnailUri={row.thumbnailUrl ?? undefined}
            playbackId={row.localId}
            duration={row.duration ?? undefined}
            attachment={metadata.attachment}
            repliedTo={item.repliedTo}
            onReplyPress={onNavigate}
            onLongPress={action}
            onRetry={retry}
          />
        </View>
      </SwipeToReply>
      {selectionMode && (
        <Pressable
          testID={`message-select-${row.localId}`}
          accessibilityRole="checkbox"
          accessibilityLabel={`${selected ? "Deselect" : "Select"} ${row.type.toLowerCase().replace("shared_", "shared ")} message from ${own ? "You" : authorName(metadata.author, receiverName)}`}
          accessibilityState={{
            checked: selected,
            disabled: interactionDisabled,
          }}
          disabled={interactionDisabled}
          onPress={action}
          style={[StyleSheet.absoluteFill, selected && styles.selected]}
        >
          <View style={[styles.checkbox, selected && styles.checked]}>
            {selected && (
              <Ionicons name="checkmark" size={14} color={COLORS.white} />
            )}
          </View>
        </Pressable>
      )}
      {highlight > 0 && <Highlight token={highlight} />}
    </View>
  );
}
export default memo(ChatMessageRow);
const styles = StyleSheet.create({
  message: { width: "100%", position: "relative" },
  selected: {
    backgroundColor: COLORS.primaryGhost,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
  },
  checkbox: {
    position: "absolute",
    left: SPACING.xs,
    top: SPACING.md,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.bgWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: COLORS.primary },
  highlight: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
  },
  date: {
    alignItems: "center",
    paddingVertical: SPACING.xs,
    marginVertical: SPACING.xs,
  },
  dateText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  unread: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.lg,
    paddingHorizontal: LAYOUT.listPaddingHorizontal,
    gap: SPACING.md,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.primaryGhostBorder,
  },
  unreadText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: "600",
    color: COLORS.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
