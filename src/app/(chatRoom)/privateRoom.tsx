import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  View,
  AppState,
  BackHandler,
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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  KeyboardAvoidingView,
  useKeyboardState,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessageRow from "@/components/chat/ChatMessageRow";
import { ChatGestureCoordinator } from "@/components/chat/ChatGestureCoordinator";
import MessageSelectionBar from "@/components/chat/MessageSelectionBar";
import ForwardMessagePicker from "@/components/chat/ForwardMessagePicker";
import { useMessageSelection } from "@/hooks/useMessageSelection";
import { canReplyToMessage } from "@/utils/messaging/actions";
import { messageStore } from "@/db/MessageStore";
import { roomStore } from "@/db/RoomStore";
import { useChat } from "@/hooks/useChat";
import { useAppSelector } from "@/store/hooks";
import type { MessageRow } from "@/db/schema";
import {
  createListItemBuilder,
  type ChatListItem,
  type ReplyContextSelection,
} from "@/utils/messaging/listItems";
import {
  setVisibleMedia,
  clearVisibleMedia,
} from "@/utils/messaging/mediaVisibility";
import type {
  AttachmentInfo,
  MessageAuthorInfo,
} from "@/utils/messaging/presentation";
import {
  ChatReadVisibility,
  ChatMediaInteraction,
} from "@/components/chat/ChatReadVisibility";
import MeasuredMessageCell, {
  MessageCellMeasurements,
} from "@/components/chat/MeasuredMessageCell";
import { ReplyNavigator } from "@/utils/messaging/replyNavigation";
import { LatestViewport } from "@/utils/messaging/viewport";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { mediaService } from "@/services/MediaService";
import { useOverlay, useOverlayVisible } from "@/providers/OverlayProvider";
import { OfflineBanner, ChatBubbleSkeleton } from "@/components/ui";
import { showAppDialog } from "@/services/AppDialogService";

interface RoomParams {
  roomId: string;
  receiverName: string;
  receiverUsername?: string;
  receiverAvatar?: string;
  conversationId: string;
  receiverId: string;
  isGroup?: string;
}
const maintainPosition = { minIndexForVisible: 0 };
const viewabilityConfig = {
  // Whole small rows, or half the viewport for oversized text/media rows.
  viewAreaCoveragePercentThreshold: 50,
  waitForInteraction: false,
  minimumViewTime: 300,
};
const mediaViewabilityConfig = {
  itemVisiblePercentThreshold: 1,
  waitForInteraction: false,
};
const keyExtractor = (item: ChatListItem) => item.id;

export default function PrivateRoom() {
  const params = useLocalSearchParams() as unknown as RoomParams;
  const user = useAppSelector((state) => state.auth.user);
  const userId = user?.id ?? "";
  const token = useAppSelector((state) => state.auth.token) ?? "";
  const author = useMemo(
    () => ({
      id: userId,
      username: user?.username,
      displayName: user?.displayName,
      avatarUrl: user?.avatarUrl,
    }),
    [userId, user?.username, user?.displayName, user?.avatarUrl],
  );
  // Remount room-scoped layout/composer state when Router reuses this screen.
  return (
    <Conversation
      key={`${userId}:${params.conversationId}`}
      params={params}
      userId={userId}
      token={token}
      author={author}
    />
  );
}

function Conversation({
  params,
  userId,
  token,
  author,
}: {
  params: RoomParams;
  userId: string;
  token: string;
  author: MessageAuthorInfo;
}) {
  const {
    conversationId,
    roomId,
    receiverId,
    receiverName,
    receiverUsername,
    receiverAvatar,
  } = params;
  const blockingOverlay = useOverlayVisible();
  const overlayBlocksReads = useRef(blockingOverlay);
  useLayoutEffect(() => { overlayBlocksReads.current = blockingOverlay; }, [blockingOverlay]);
  const [isFocused, setFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  // RN 0.85's MVCP increments pendingScrollUpdateCount when index 0 changes.
  // At stationary offset 0 there may be no native scroll event to release that
  // gate, so viewability waits until a touch. Native MVCP owns HISTORY only;
  // measured latest-edge sticking owns offset 0, never both simultaneously.
  const [anchorHistory, setAnchorHistory] = useState(false);
  const unreadSnapshotTaken = useRef(false);
  const list = useRef<FlatList<ChatListItem>>(null);
  const [mediaOwner] = useState(() => Symbol("chat-media"));
  const visibleIds = useRef<string[]>([]);
  const mediaIds = useRef<string[]>([]);
  const [replyContext, setReplyContext] =
    useState<ReplyContextSelection | null>(null);
  const contextActive = useRef(false);
  const navigationRequest = useRef(0);
  const manualDrag = useRef(false);
  const listHeight = useRef(0);
  const covered = useRef(0);
  const canRead = useCallback(() => covered.current === 0 && !overlayBlocksReads.current, []);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<{
    id: string;
    token: number;
  } | null>(null);
  const rowsRef = useRef<MessageRow[]>([]);
  const mounted = useRef(true);
  const focusedRef = useRef(false);
  const [viewport] = useState(() => new LatestViewport());
  const [buildItems] = useState(createListItemBuilder);
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const composerSafeArea = useAnimatedStyle(() => ({
    paddingBottom: insets.bottom * (1 - Math.min(1, Math.max(0, keyboardProgress.value))),
  }), [insets.bottom]);
  const { openActionMenu } = useOverlay();
  const {
    messages,
    send,
    replyMsg,
    retry,
    sendMedia,
    onTyping,
    markVisibleRead,
    getLoadedMessage,
    isTyping,
    isSyncing,
    isLoadingMore,
    isOffline,
    syncError,
    paginationError,
    loadMore,
    loadReplyTarget,
    hasMore,
    refresh,
    releaseHistory,
  } = useChat({
    roomId,
    conversationId,
    currentUser: useMemo(
      () => ({ ...author, id: userId, token }),
      [author, userId, token],
    ),
    isFocused,
    canRead,
  });
  const selection = useMessageSelection(messages, userId);
  const { ids: selectedIds, idsRef: selectedIdsRef, busyRef: selectionBusy,
    toggle: onAction, cancel: cancelSelection, handleBack: selectionBack } = selection;
  const selectionMode = selection.active || selection.busy;
  const canReleaseHistory = useCallback(() => !selectedIdsRef.current.size && !selectionBusy.current,
    [selectedIdsRef, selectionBusy]);
  useEffect(() => {
    if (!blockingOverlay && focusedRef.current) {
      markVisibleRead(visibleIds.current);
      list.current?.recordInteraction?.();
    }
  }, [blockingOverlay, markVisibleRead]);

  const coverReads = useCallback(() => {
    covered.current++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      covered.current = Math.max(0, covered.current - 1);
      if (!covered.current && focusedRef.current) {
        markVisibleRead(visibleIds.current);
        list.current?.recordInteraction?.();
      }
    };
  }, [markVisibleRead]);

  const confirmMediaInteraction = useCallback(
    (id?: string) => {
      if (!id || !focusedRef.current) return;
      mediaIds.current = [...new Set([...mediaIds.current, id])];
      setVisibleMedia(mediaOwner, mediaIds.current);
    },
    [mediaOwner],
  );

  const [navigator] = useState(() => new ReplyNavigator());
  useLayoutEffect(
    () =>
      navigator.configure({
        list: () => list.current,
        height: () => listHeight.current,
        arrived: (id, serial) => setHighlight({ id, token: serial }),
        failed: () =>
          setNavigationError(
            "Couldn’t locate the exact position. Tap the reply again to retry.",
          ),
      }),
    [navigator],
  );
  const measurements = useMemo(
    () => ({
      measure: (id: string, index: number, y: number, height: number) =>
        navigator.measure(id, index, y, height),
      remove: (id: string) => navigator.unmeasure(id),
    }),
    [navigator],
  );
  useEffect(
    () => () => {
      mounted.current = false;
      navigationRequest.current++;
      navigator.cancel();
    },
    [navigator],
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      focusedRef.current = true;
      setVisibleMedia(mediaOwner, mediaIds.current);
      list.current?.recordInteraction?.();
      // Focus never changes scroll position (e.g. returning from image viewer).
      return () => {
        focusedRef.current = false;
        if (mounted.current) {
          setFocused(false);
          setReplyContext((previous) =>
            previous?.status === "loading"
              ? {
                  ...previous,
                  status: "cached",
                  error: "Context check paused. Tap to check again.",
                }
              : previous,
          );
        }
        clearVisibleMedia(mediaOwner);
        navigationRequest.current++;
        navigator.cancel();
      };
    }, [mediaOwner, navigator]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && focusedRef.current)
        list.current?.recordInteraction?.();
    });
    return () => subscription.remove();
  }, []);

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
    () => buildItems(messages, userId, firstUnreadId, new Date(), replyContext),
    [buildItems, messages, userId, firstUnreadId, replyContext],
  );

  useEffect(() => {
    if (isFocused && AppState.currentState === "active")
      list.current?.recordInteraction?.();
  }, [data, isFocused]);

  useLayoutEffect(() => {
    rowsRef.current = messages;
    contextActive.current = replyContext !== null;
    navigator.update(data);
  }, [messages, replyContext, navigator, data]);
  const goToMessage = useCallback(
    (id: string, showContext = true) => {
      const request = ++navigationRequest.current;
      const current = () =>
        request === navigationRequest.current && focusedRef.current;
      manualDrag.current = false;
      viewport.leaveLatest();
      setAnchorHistory(true);
      setShowJump(true);
      setNavigationError(null);
      setReplyContext(
        showContext ? { parentId: id, page: 0, status: "loading" } : null,
      );
      navigator.request(id);
      if (
        !showContext &&
        rowsRef.current.some((row) => row.id === id || row.localId === id)
      )
        return;
      void loadReplyTarget(id, current)
        .then((result) => {
          if (!current()) return;
          if (showContext)
            setReplyContext((previous) =>
              previous
                ? {
                    ...previous,
                    parentId: result.parent.id || result.parent.localId,
                    status: result.complete ? "complete" : "cached",
                    error: result.error,
                  }
                : previous,
            );
        })
        .catch((error) => {
          if (!current()) return;
          navigator.cancel();
          setNavigationError(
            error instanceof Error
              ? error.message
              : "Couldn’t load the original message. Try again.",
          );
          setReplyContext((previous) =>
            previous ? { ...previous, status: "error" } : previous,
          );
        });
    },
    [loadReplyTarget, navigator, viewport],
  );
  const closeContext = useCallback(() => {
    navigationRequest.current++;
    navigator.cancel();
    setReplyContext(null);
    setNavigationError(null);
  }, [navigator]);
  const contextPage = useCallback(
    (page: number) =>
      setReplyContext((previous) =>
        previous ? { ...previous, page } : previous,
      ),
    [],
  );
  const refreshContext = useCallback(() => {
    if (replyContext) goToMessage(replyContext.parentId);
  }, [replyContext, goToMessage]);

  const scrollLatest = useCallback(
    (animated = false) => {
      closeContext();
      manualDrag.current = false;
      setAnchorHistory(false);
      if (viewport.requestLatest())
        list.current?.scrollToOffset({ offset: 0, animated });
      setShowJump(false);
    },
    [viewport, closeContext],
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
    async (
      type: string,
      uri: string,
      duration?: number,
      replyId?: string,
      attachment?: AttachmentInfo,
    ) => {
      scrollLatest();
      await sendMedia(type, uri, receiverId, duration, replyId, attachment);
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
  const onReply = useCallback((message: MessageRow) => {
    if (selectedIdsRef.current.size || selectionBusy.current) return;
    const current = getLoadedMessage ? getLoadedMessage(message.localId)
      : rowsRef.current.find(row => row.localId === message.localId);
    if (!current || !canReplyToMessage(current)) return;
    setReplyingTo(current);
  }, [selectedIdsRef, selectionBusy, getLoadedMessage]);
  const selectedReply = selection.replyTarget;
  const replySelected = useCallback(() => {
    if (selectedReply && cancelSelection()) onReply(selectedReply);
  }, [selectedReply, cancelSelection, onReply]);
  const selectedRetry = selection.retryTarget;
  const retrySelected = useCallback(() => {
    if (selectedRetry && cancelSelection()) onRetry(selectedRetry);
  }, [selectedRetry, cancelSelection, onRetry]);
  const replyLocalId = replyingTo?.localId;
  const replyServerId = replyingTo?.id;
  useEffect(() => {
    if (!replyLocalId) return;
    let active = true;
    const clearRemovedReply = () => {
      if (!active) return;
      setReplyingTo(previous => previous?.localId === replyLocalId ? null : previous);
      setNavigationError("The message you were replying to was removed. Your draft has been kept.");
    };
    const stop = messageStore.subscribe(change => {
      if (change.conversationId && change.conversationId !== conversationId) return;
      const changed = change.type === "upsert" ? change.rows.find(row =>
        row.localId === replyLocalId || (replyServerId && row.id === replyServerId)) : undefined;
      if (change.type === "clear" || changed?.deletedAt ||
        (change.type === "invalidate" && (change.messageId === replyLocalId || change.messageId === replyServerId))) {
        clearRemovedReply();
      } else if (changed) setReplyingTo(previous => previous && previous.localId === replyLocalId && (
        previous.content !== changed.content || previous.senderData !== changed.senderData ||
        previous.mediaUrl !== changed.mediaUrl || previous.thumbnailUrl !== changed.thumbnailUrl ||
        previous.duration !== changed.duration || previous.attachmentData !== changed.attachmentData
      ) ? changed : previous);
    });
    void messageStore.getByLocalId(replyLocalId).then(row => {
      if (active && (!row || row.deletedAt)) clearRemovedReply();
    }).catch(() => {});
    return () => { active = false; stop(); };
  }, [conversationId, replyLocalId, replyServerId]);
  const onMenu = useCallback(
    async (anchor?: { x: number; y: number; width: number; height: number }) => {
      const muted = (await roomStore.findRoom(conversationId).catch(() => []))[0]?.muted ?? false;
      openActionMenu(
        [
          { key: "search", icon: "search", label: "Search", onPress: () => {} },
          {
            key: "mute",
            icon: "notifications-off-outline",
            label: muted ? "Unmute in-app banners" : "Mute in-app banners",
            onPress: async () => {
              try {
                const room = (await roomStore.findRoom(conversationId))[0];
                if (!room) throw new Error("Conversation metadata is unavailable");
                await roomStore.setMuted(conversationId, !room.muted);
                showAppDialog({ title: room.muted ? "Conversation unmuted" : "Conversation muted",
                  message: room.muted ? "In-app message banners are enabled for this conversation."
                    : "In-app message banners are muted for this conversation. Server push mute requires the compatible backend release." });
              } catch {
                showAppDialog({ title: "Couldn’t update notifications", message: "Please try again when the conversation is available.", tone: "error" });
              }
            },
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
  const onBack = useCallback(() => { if (!selectionBack()) router.back(); }, [selectionBack]);
  useEffect(() => {
    if (!isFocused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", selectionBack);
    return () => subscription.remove();
  }, [isFocused, selectionBack]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatListItem>) => (
      <ChatMessageRow
        item={item}
        userId={userId}
        receiverName={receiverName}
        onAction={onAction}
        onReply={onReply}
        selectionMode={selectionMode}
        selected={item.kind === "message" && selectedIds.has(item.message.localId)}
        interactionDisabled={selection.busy}
        onRetry={onRetry}
        isGroup={params.isGroup === "true"}
        onNavigate={goToMessage}
        onContextClose={closeContext}
        onContextPage={contextPage}
        onContextRefresh={refreshContext}
        highlight={
          item.kind === "message" && item.message.localId === highlight?.id
            ? highlight.token
            : 0
        }
      />
    ),
    [
      userId,
      receiverName,
      onAction,
      onReply,
      selectionMode,
      selectedIds,
      selection.busy,
      onRetry,
      params.isGroup,
      goToMessage,
      closeContext,
      contextPage,
      refreshContext,
      highlight,
    ],
  );
  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatListItem>[] }) => {
      visibleIds.current = viewableItems.flatMap(({ item }) =>
        item.kind === "message" ? [item.message.localId] : [],
      );
      markVisibleRead(visibleIds.current);
      navigator.viewable(visibleIds.current);
    },
    [markVisibleRead, navigator],
  );
  const onMediaViewable = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatListItem>[] }) => {
      mediaIds.current = viewableItems.flatMap(({ item }) =>
        item.kind === "message" ? [item.message.localId] : [],
      );
      if (focusedRef.current) setVisibleMedia(mediaOwner, mediaIds.current);
      navigator.progress(mediaIds.current);
    },
    [mediaOwner, navigator],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.userScroll(event.nativeEvent.contentOffset.y);
      const show = !viewport.atLatest;
      if (show) setAnchorHistory(true);
      setShowJump((previous) => (previous === show ? previous : show));
    },
    [viewport],
  );
  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      viewport.endInteraction(event.nativeEvent.contentOffset.y);
      navigator.settled();
      setAnchorHistory(!viewport.atLatest || navigator.pending || contextActive.current);
      if (!manualDrag.current && (navigator.pending || contextActive.current))
        viewport.leaveLatest();
      if (
        event.nativeEvent.contentOffset.y <= 1 &&
        !navigator.pending &&
        !contextActive.current &&
        canReleaseHistory()
      )
        releaseHistory();
    },
    [viewport, releaseHistory, navigator, canReleaseHistory],
  );
  const onOlder = useCallback(() => {
    if (
      manualDrag.current &&
      viewport.hasInteracted &&
      hasMore &&
      !isLoadingMore &&
      !paginationError
    )
      void loadMore();
  }, [viewport, hasMore, isLoadingMore, paginationError, loadMore]);

  const pendingJump = useRef<number | null>(null);
  const jumpAttempts = useRef(0);
  const jumpUnread = useCallback(() => {
    closeContext();
    manualDrag.current = false;
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
    setAnchorHistory(true);
    pendingJump.current = index;
    jumpAttempts.current = 0;
    list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
  }, [unread, data, scrollLatest, viewport, closeContext]);
  const onIndexFailed = useCallback(
    ({
      index,
      averageItemLength,
    }: {
      index: number;
      averageItemLength: number;
    }) => {
      if (navigator.indexFailed(averageItemLength)) return;
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
    [navigator],
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

  const viewabilityPairs = useMemo(
    () => [
      { viewabilityConfig, onViewableItemsChanged: onMeasuredViewable },
      {
        viewabilityConfig: mediaViewabilityConfig,
        onViewableItemsChanged: onMediaViewable,
      },
    ],
    [onMeasuredViewable, onMediaViewable],
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
          {selectionMode ? <MessageSelectionBar
            count={selectedIds.size} busy={selection.busy}
            canCopy={selection.canCopy} canDelete={selection.canDelete} canForward={selection.canForward}
            canReply={Boolean(selectedReply)} canRetry={Boolean(selectedRetry)}
            onCancel={cancelSelection} onCopy={selection.copy} onDelete={selection.requestDelete}
            onForward={selection.openForward} onReply={replySelected} onRetry={retrySelected}
          /> : <ChatHeader
            receiverName={receiverName}
            avatarUri={receiverAvatar ?? ""}
            onBack={onBack}
            onProfilePress={onProfile}
            onMenuPress={onMenu}
            isTyping={isTyping}
          />}
        </View>
      </SafeAreaView>
      {/* KeyboardProvider suppresses native Android IME resizing while active.
        This ONE controller KAV therefore resizes list + composer on BOTH platforms. */}
      <ChatReadVisibility.Provider value={coverReads}>
        <ChatMediaInteraction.Provider value={confirmMediaInteraction}>
          <KeyboardAvoidingView
            style={styles.messageViewport}
            behavior="padding"
            enabled
            automaticOffset
          >
            <View style={styles.listViewport} testID="chat-message-viewport">
              <MessageCellMeasurements.Provider value={measurements}>
                <ChatGestureCoordinator>
                  <FlatList
                    CellRendererComponent={MeasuredMessageCell}
                    initialNumToRender={12}
                    maxToRenderPerBatch={8}
                    windowSize={9}
                    ref={list}
                    testID="chat-message-list"
                    style={styles.messageList}
                    data={data}
                    extraData={selectedIds}
                    inverted
                    keyExtractor={keyExtractor}
                    renderItem={renderItem}
                    maintainVisibleContentPosition={anchorHistory ? maintainPosition : undefined}
                    automaticallyAdjustKeyboardInsets={false}
                    contentInsetAdjustmentBehavior="never"
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={
                      Platform.OS === "ios" ? "interactive" : "on-drag"
                    }
                    contentContainerStyle={styles.listContent}
                    onLayout={(event) => {
                      listHeight.current = event.nativeEvent.layout.height;
                      if (
                        viewport.layout(listHeight.current) &&
                        !navigator.pending &&
                        !contextActive.current
                      )
                        list.current?.scrollToOffset({
                          offset: 0,
                          animated: false,
                        });
                      navigator.settled();
                    }}
                    onContentSizeChange={(_width, height) => {
                      if (focusedRef.current) list.current?.recordInteraction?.();
                      if (
                        viewport.content(height) &&
                        !navigator.pending &&
                        !contextActive.current
                      )
                        list.current?.scrollToOffset({
                          offset: 0,
                          animated: false,
                        });
                      if (
                        viewport.atLatest &&
                        !viewport.interacting &&
                        !navigator.pending &&
                        !contextActive.current &&
                        canReleaseHistory()
                      )
                        releaseHistory();
                    }}
                    onScrollBeginDrag={() => {
                      manualDrag.current = true;
                      setAnchorHistory(true);
                      navigator.cancel();
                      viewport.beginInteraction();
                    }}
                    onMomentumScrollBegin={() => {
                      navigator.started();
                      setAnchorHistory(true);
                      viewport.beginInteraction();
                    }}
                    onScrollEndDrag={onScrollEnd}
                    onMomentumScrollEnd={onScrollEnd}
                    onScroll={onScroll}
                    scrollEventThrottle={32}
                    onEndReached={onOlder}
                    onEndReachedThreshold={0.3}
                    viewabilityConfigCallbackPairs={viewabilityPairs}
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
                              color={COLORS.primary}
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
                </ChatGestureCoordinator>
              </MessageCellMeasurements.Provider>
              {replyContext?.status === "loading" &&
                !messages.some(
                  (row) =>
                    row.id === replyContext.parentId ||
                    row.localId === replyContext.parentId,
                ) && (
                  <View style={styles.navigationNotice}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.loadingMoreText}>
                      Finding the original message and replies…
                    </Text>
                    <TouchableOpacity
                      accessibilityLabel="Cancel reply lookup"
                      onPress={closeContext}
                      style={{ minHeight: 44, justifyContent: "center" }}
                    >
                      <Text style={styles.loadingMoreText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              {selection.notice && (
                <TouchableOpacity style={styles.navigationNotice} onPress={selection.dismissNotice}
                  testID="message-selection-notice" accessibilityLabel="Dismiss message action result">
                  <Text style={styles.loadingMoreText} accessibilityRole="alert">{selection.notice}</Text>
                </TouchableOpacity>
              )}
              {navigationError && !selection.notice && (
                <TouchableOpacity
                  style={styles.navigationNotice}
                  accessibilityLabel="Dismiss reply navigation notice"
                  onPress={() => setNavigationError(null)}
                >
                  <Text
                    style={styles.loadingMoreText}
                    accessibilityRole="alert"
                  >
                    {navigationError}
                  </Text>
                </TouchableOpacity>
              )}
              {/* Pagination feedback is overlayed, never inserted before the anchor. */}
              {(isLoadingMore || paginationError || syncError) && (
                <View style={styles.paginationStatus}>
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
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
                    colors={[COLORS.primary, COLORS.accentPurple]}
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
                      color={COLORS.white}
                    />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
            <Animated.View style={[styles.composerSafeArea, composerSafeArea]}>
              <ChatComposer
                replyingTo={replyingTo}
                disabled={selectionMode}
                userId={userId}
                onCancelReply={cancelReply}
                onTyping={onTyping}
                onSend={handleSend}
                onSendMedia={handleMedia}
                onReplyPress={goToMessage}
              />
            </Animated.View>
          </KeyboardAvoidingView>
          {selection.forwardOpen && <ForwardMessagePicker
            count={selectedIds.size} busy={selection.busy} error={selection.forwardError}
            onClose={selection.closeForward} onForward={selection.forward}
          />}
        </ChatMediaInteraction.Provider>
      </ChatReadVisibility.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  navigationNotice: {
    position: "absolute",
    top: SPACING.lg,
    left: SPACING.xl,
    right: SPACING.xl,
    padding: SPACING.lg,
    backgroundColor: COLORS.bgWhite,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    zIndex: 4,
  },
  container: { flex: 1, backgroundColor: COLORS.bgMain },
  composerSafeArea: { backgroundColor: "#F7F6FB" },
  headerSafeArea: { backgroundColor: COLORS.bgWhite },
  headerWrapper: {
    zIndex: 10,
    elevation: 5,
    backgroundColor: COLORS.bgWhite,
  },
  messageViewport: { flex: 1 },
  listViewport: { flex: 1, minHeight: 0 },
  messageList: { flex: 1, backgroundColor: "#F7F6FB" },
  listContent: { paddingVertical: SPACING.md },
  emptyLoading: {
    paddingVertical: SPACING.xl,
    transform: [{ scaleY: -1 }],
  },
  emptyState: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxxxxl,
    paddingVertical: SPACING.xxxxl,
    transform: [{ scaleY: -1 }],
  },
  emptyStateIcon: {
    width: 66,
    height: 66,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEAFE",
    marginBottom: SPACING.lg,
  },
  emptyStateTitle: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl4,
    fontWeight: "700",
    marginBottom: SPACING.xs,
  },
  emptyStateText: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: 20,
    textAlign: "center",
  },
  paginationStatus: {
    position: "absolute",
    top: 8,
    alignSelf: "center",
    padding: 8,
    borderRadius: 12,
    backgroundColor: COLORS.bgWhite,
  },
  loadingMoreText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  jumpToUnreadTouchable: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    borderRadius: 18,
    zIndex: 10,
    ...SHADOWS.md,
  },
  jumpToUnread: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    overflow: "hidden",
  },
  jumpText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
});
