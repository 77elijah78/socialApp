import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Keyboard,
  Platform,
  ActivityIndicator,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessageRow from "@/components/chat/ChatMessageRow";
import { useChat } from "@/hooks/useChat";
import { useAppSelector } from "@/store/hooks";
import type { MessageRow } from "@/db/schema";
import {
  createListItemBuilder,
  type ChatListItem,
} from "@/utils/messaging/listItems";
import {
  setVisibleMedia,
  clearVisibleMedia,
} from "@/utils/messaging/mediaVisibility";
import { LatestViewport } from "@/utils/messaging/viewport";
import theme from "@/constants/theme";
import { mediaService } from "@/services/MediaService";
import { useOverlay, type ActionMenuItem } from "@/providers/OverlayProvider";
import { OfflineBanner, ChatBubbleSkeleton } from "@/components/ui";
import { showAppDialog } from "@/services/AppDialogService";

interface RoomParams {
  roomId: string;
  receiverName: string;
  receiverUsername?: string;
  receiverAvatar?: string;
  conversationId: string;
  receiverId: string;
}
const maintainPosition = { minIndexForVisible: 0 };
const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 300,
};
const keyExtractor = (item: ChatListItem) => item.id;

export default function PrivateRoom() {
  const params = useLocalSearchParams() as unknown as RoomParams;
  const userId = useAppSelector((state) => state.auth.user?.id) ?? "";
  const token = useAppSelector((state) => state.auth.token) ?? "";
  // Remount room-scoped layout/composer state when Router reuses this screen.
  return (
    <Conversation
      key={`${userId}:${params.conversationId}`}
      params={params}
      userId={userId}
      token={token}
    />
  );
}

function Conversation({
  params,
  userId,
  token,
}: {
  params: RoomParams;
  userId: string;
  token: string;
}) {
  const {
    conversationId,
    roomId,
    receiverId,
    receiverName,
    receiverUsername,
    receiverAvatar,
  } = params;
  const [isFocused, setFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const unreadSnapshotTaken = useRef(false);
  const list = useRef<FlatList<ChatListItem>>(null);
  const [mediaOwner] = useState(() => Symbol("chat-media"));
  const visibleIds = useRef<string[]>([]);
  const focusedRef = useRef(false);
  const [viewport] = useState(() => new LatestViewport());
  const [buildItems] = useState(createListItemBuilder);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { openActionMenu } = useOverlay();
  const {
    messages,
    send,
    replyMsg,
    retry,
    sendMedia,
    onTyping,
    markVisibleRead,
    isTyping,
    isSyncing,
    isLoadingMore,
    isOffline,
    syncError,
    paginationError,
    loadMore,
    hasMore,
    refresh,
    releaseHistory,
  } = useChat({
    roomId,
    conversationId,
    currentUser: { id: userId, token },
    isFocused,
  });

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      focusedRef.current = true;
      setVisibleMedia(mediaOwner, visibleIds.current);
      // Focus never changes scroll position (e.g. returning from image viewer).
      return () => {
        focusedRef.current = false;
        setFocused(false);
        clearVisibleMedia(mediaOwner);
      };
    }, [mediaOwner]),
  );

  useEffect(() => {
    if (!unreadSnapshotTaken.current && messages.length) {
      unreadSnapshotTaken.current = true;
      setFirstUnreadId(
        messages.find(
          (row) =>
            row.senderId !== userId && !row.isRead && row.status !== "READ",
        )?.localId ?? null,
      );
    }
  }, [messages, userId]);
  const unread = useMemo(
    () =>
      messages.filter(
        (row) =>
          row.senderId !== userId && !row.isRead && row.status !== "READ",
      ),
    [messages, userId],
  );
  const data = useMemo(
    () => buildItems(messages, userId, firstUnreadId),
    [buildItems, messages, userId, firstUnreadId],
  );

  const scrollLatest = useCallback(
    (animated = false) => {
      if (viewport.requestLatest())
        list.current?.scrollToOffset({ offset: 0, animated });
      setShowJump(false);
    },
    [viewport],
  );
  const handleSend = useCallback(
    async (text: string, replyId?: string) => {
      // A deliberate send is an explicit request to return to the latest message.
      scrollLatest();
      if (replyId) await replyMsg(text, replyId, receiverId);
      else await send(text, receiverId);
    },
    [receiverId, replyMsg, send, scrollLatest],
  );
  const handleMedia = useCallback(
    async (type: string, uri: string, duration?: number) => {
      scrollLatest();
      await sendMedia(type, uri, receiverId, duration);
    },
    [receiverId, sendMedia, scrollLatest],
  );
  const cancelReply = useCallback(() => setReplyingTo(null), []);
  const onRetry = useCallback(
    (message: MessageRow) => {
      void retry(message.localId, receiverId).catch(() =>
        showAppDialog({
          title: "Still couldn’t send",
          message:
            "The message remains saved. Try again when your messaging connection is available.",
          tone: "error",
        }),
      );
    },
    [receiverId, retry],
  );
  const onAction = useCallback(
    (message: MessageRow) => {
      const own = message.senderId === userId;
      const remove = async (deleteFor: "me" | "everyone") => {
        try {
          await mediaService.message.delete(
            message.id ?? message.localId,
            deleteFor,
          );
        } catch {
          showAppDialog({
            title: "Couldn’t delete message",
            message: "Your message has not been removed. Please try again.",
            tone: "error",
          });
        }
      };
      const actions: ActionMenuItem[] = [
        {
          key: "reply",
          icon: "arrow-undo-outline",
          label: "Reply",
          onPress: () => setReplyingTo(message),
        },
        ...(own && message.status === "FAILED"
          ? [
              {
                key: "retry",
                icon: "refresh-outline" as const,
                label: "Retry send",
                onPress: () => onRetry(message),
              },
            ]
          : []),
        ...(own
          ? [
              {
                key: "delete",
                icon: "trash-outline" as const,
                label: "Delete",
                destructive: true,
                onPress: () =>
                  openActionMenu([
                    {
                      key: "me",
                      icon: "close-circle-outline",
                      label: "Delete for me",
                      onPress: () => remove("me"),
                    },
                    {
                      key: "everyone",
                      icon: "people-outline",
                      label: "Delete for everyone",
                      destructive: true,
                      onPress: () => remove("everyone"),
                    },
                  ]),
              },
            ]
          : [
              {
                key: "cannot",
                icon: "lock-closed-outline" as const,
                label: "Cannot delete others messages",
                onPress: () => {},
              },
            ]),
      ];
      openActionMenu(actions);
    },
    [openActionMenu, onRetry, userId],
  );
  const onMenu = useCallback(
    (anchor?: { x: number; y: number; width: number; height: number }) => {
      openActionMenu(
        [
          { key: "search", icon: "search", label: "Search", onPress: () => {} },
          {
            key: "mute",
            icon: "notifications-off-outline",
            label: "Mute notifications",
            onPress: () => {},
          },
          {
            key: "wallpaper",
            icon: "image-outline",
            label: "Wallpaper",
            onPress: () => {},
          },
          {
            key: "delete",
            icon: "trash-outline",
            label: "Delete conversation",
            destructive: true,
            onPress: async () => {
              try {
                await mediaService.message.deleteConversation(conversationId);
                router.back();
              } catch {
                showAppDialog({
                  title: "Couldn’t delete conversation",
                  message: "Please try again in a moment.",
                  tone: "error",
                });
              }
            },
          },
        ],
        anchor,
      );
    },
    [conversationId, openActionMenu],
  );
  const onProfile = useCallback(() => {
    if (keyboardVisible) Keyboard.dismiss();
    else if (receiverUsername) router.push(`/user/${receiverUsername}`);
  }, [keyboardVisible, receiverUsername]);
  const onBack = useCallback(() => router.back(), []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatListItem>) => (
      <ChatMessageRow
        item={item}
        userId={userId}
        receiverName={receiverName}
        onAction={onAction}
        onRetry={onRetry}
      />
    ),
    [userId, receiverName, onAction, onRetry],
  );
  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatListItem>[] }) => {
      visibleIds.current = viewableItems.flatMap(({ item }) =>
        item.kind === "message" ? [item.message.localId] : [],
      );
      if (focusedRef.current) setVisibleMedia(mediaOwner, visibleIds.current);
      markVisibleRead(visibleIds.current);
    },
    [markVisibleRead, mediaOwner],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.userScroll(event.nativeEvent.contentOffset.y);
      const show = !viewport.atLatest;
      setShowJump((previous) => (previous === show ? previous : show));
    },
    [viewport],
  );
  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.endInteraction(event.nativeEvent.contentOffset.y);
      if (event.nativeEvent.contentOffset.y <= 1) releaseHistory();
    },
    [viewport, releaseHistory],
  );
  const onOlder = useCallback(() => {
    if (viewport.hasInteracted && hasMore && !isLoadingMore && !paginationError)
      void loadMore();
  }, [viewport, hasMore, isLoadingMore, paginationError, loadMore]);

  const pendingJump = useRef<number | null>(null);
  const jumpAttempts = useRef(0);
  const jumpUnread = useCallback(() => {
    if (!unread.length) {
      scrollLatest(true);
      return;
    }
    const id = unread[unread.length - 1].localId;
    const index = data.findIndex(
      (item) => item.kind === "message" && item.message.localId === id,
    );
    if (index < 0) return;
    viewport.leaveLatest();
    pendingJump.current = index;
    jumpAttempts.current = 0;
    list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
  }, [unread, data, scrollLatest, viewport]);
  const onIndexFailed = useCallback(
    ({
      index,
      averageItemLength,
    }: {
      index: number;
      averageItemLength: number;
    }) => {
      // One estimate, followed by a retry on actual viewability/layout progress.
      // No fixed-height getItemLayout and no frame/timeout retry chain.
      pendingJump.current = index;
      if (jumpAttempts.current++ >= 2) {
        pendingJump.current = null;
        return;
      }
      list.current?.scrollToOffset({
        offset: Math.max(0, index * averageItemLength),
        animated: false,
      });
    },
    [],
  );
  const onMeasuredViewable = useCallback(
    (info: { viewableItems: ViewToken<ChatListItem>[] }) => {
      onViewable(info);
      if (
        pendingJump.current !== null &&
        info.viewableItems.some(
          (item) => Math.abs((item.index ?? 0) - pendingJump.current!) <= 10,
        )
      ) {
        const index = pendingJump.current;
        pendingJump.current = null;
        list.current?.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0.2,
        });
      }
    },
    [onViewable],
  );

  return (
    <View style={styles.container}>
      <OfflineBanner
        isOffline={isOffline}
        onRetry={() => {
          void refresh();
        }}
        message="Messaging connection unavailable"
      />
      <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
        <View style={styles.headerWrapper}>
          <ChatHeader
            receiverName={receiverName}
            avatarUri={receiverAvatar ?? ""}
            onBack={onBack}
            onProfilePress={onProfile}
            onMenuPress={onMenu}
            isTyping={isTyping}
          />
        </View>
      </SafeAreaView>
      {/* KeyboardProvider suppresses native Android IME resizing while active.
        This ONE controller KAV therefore resizes list + composer on BOTH platforms. */}
      <KeyboardAvoidingView
        style={styles.messageViewport}
        behavior="padding"
        enabled
        automaticOffset
      >
        <View style={styles.listViewport} testID="chat-message-viewport">
          <FlatList
            ref={list}
            testID="chat-message-list"
            style={styles.messageList}
            data={data}
            inverted
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            maintainVisibleContentPosition={maintainPosition}
            automaticallyAdjustKeyboardInsets={false}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            contentContainerStyle={styles.listContent}
            onLayout={(event) => {
              if (viewport.layout(event.nativeEvent.layout.height))
                list.current?.scrollToOffset({ offset: 0, animated: false });
            }}
            onContentSizeChange={(_width, height) => {
              if (viewport.content(height))
                list.current?.scrollToOffset({ offset: 0, animated: false });
              if (viewport.atLatest && !viewport.interacting) releaseHistory();
            }}
            onScrollBeginDrag={() => viewport.beginInteraction()}
            onMomentumScrollBegin={() => viewport.beginInteraction()}
            onScrollEndDrag={onScrollEnd}
            onMomentumScrollEnd={onScrollEnd}
            onScroll={onScroll}
            scrollEventThrottle={32}
            onEndReached={onOlder}
            onEndReachedThreshold={0.3}
            onViewableItemsChanged={onMeasuredViewable}
            viewabilityConfig={viewabilityConfig}
            onScrollToIndexFailed={onIndexFailed}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              isSyncing ? (
                <View style={styles.emptyLoading}>
                  <ChatBubbleSkeleton isOwn={false} />
                  <ChatBubbleSkeleton isOwn />
                  <ChatBubbleSkeleton isOwn={false} />
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyStateIcon}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={28}
                      color={theme.COLORS.primary}
                    />
                  </View>
                  <Text style={styles.emptyStateTitle}>
                    A quiet little corner
                  </Text>
                  <Text style={styles.emptyStateText}>
                    Send a message to start the conversation.
                  </Text>
                </View>
              )
            }
          />
          {/* Pagination feedback is overlayed, never inserted before the anchor. */}
          {(isLoadingMore || paginationError || syncError) && (
            <View style={styles.paginationStatus}>
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={theme.COLORS.primary} />
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    void (paginationError ? loadMore() : refresh());
                  }}
                  accessibilityLabel="Retry loading messages"
                >
                  <Text style={styles.loadingMoreText}>
                    Couldn’t load messages · Tap to retry
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {showJump && (
            <TouchableOpacity
              style={styles.jumpToUnreadTouchable}
              onPress={jumpUnread}
              accessibilityLabel={
                unread.length
                  ? `Jump to ${unread.length} unread messages`
                  : "Jump to latest message"
              }
            >
              <LinearGradient
                colors={[theme.COLORS.primary, theme.COLORS.accentPurple]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.jumpToUnread}
              >
                <Text style={styles.jumpText}>
                  {unread.length
                    ? `${unread.length} unread ${unread.length === 1 ? "message" : "messages"}`
                    : "Latest messages"}
                </Text>
                <Ionicons
                  name="arrow-down"
                  size={17}
                  color={theme.COLORS.white}
                />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
        <View
          style={{
            paddingBottom: keyboardVisible ? 0 : insets.bottom,
            backgroundColor: "#F7F6FB",
          }}
        >
          <ChatComposer
            replyingTo={replyingTo}
            userId={userId}
            onCancelReply={cancelReply}
            onTyping={onTyping}
            onSend={handleSend}
            onSendMedia={handleMedia}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.COLORS.bgMain },
  headerSafeArea: { backgroundColor: theme.COLORS.bgWhite },
  headerWrapper: {
    zIndex: 10,
    elevation: 5,
    backgroundColor: theme.COLORS.bgWhite,
  },
  messageViewport: { flex: 1 },
  listViewport: { flex: 1, minHeight: 0 },
  messageList: { flex: 1, backgroundColor: "#F7F6FB" },
  listContent: { paddingVertical: theme.SPACING.md },
  emptyLoading: {
    paddingVertical: theme.SPACING.xl,
    transform: [{ scaleY: -1 }],
  },
  emptyState: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xxxxxl,
    paddingVertical: theme.SPACING.xxxxl,
    transform: [{ scaleY: -1 }],
  },
  emptyStateIcon: {
    width: 66,
    height: 66,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEAFE",
    marginBottom: theme.SPACING.lg,
  },
  emptyStateTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: "700",
    marginBottom: theme.SPACING.xs,
  },
  emptyStateText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    lineHeight: 20,
    textAlign: "center",
  },
  paginationStatus: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    padding: 8,
    borderRadius: 12,
    backgroundColor: theme.COLORS.bgWhite,
  },
  loadingMoreText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  jumpToUnreadTouchable: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    borderRadius: 18,
    zIndex: 10,
    ...theme.SHADOWS.md,
  },
  jumpToUnread: {
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    overflow: "hidden",
  },
  jumpText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
});
