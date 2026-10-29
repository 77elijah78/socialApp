import { router, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Pressable,
  Keyboard,
  Platform,
  Animated,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageCard from "@/components/messages/MessageCard";
import { MessageCardProps } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { useChat } from "@/hooks/useChat";
import { useAppSelector } from "@/store/hooks";
import theme from "@/constants/theme";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { PickedFile } from "@/types";
import MediaPickerModal from "@/components/messages/MediaPickerModal";
import { mediaService } from "@/services/MediaService";
import { useOverlay, type ActionMenuItem } from "@/providers/OverlayProvider";
import { OfflineBanner, ChatBubbleSkeleton } from "@/components/ui";
import { showAppDialog } from "@/services/AppDialogService";
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";

function getMessageType(type: string): string {
  switch (type) {
    case "TEXT":
      return "text";
    case "IMAGE":
      return "image/jpeg";
    case "VIDEO":
      return "video/mp4";
    case "AUDIO":
      return "audio/mpeg";
    case "SHARED_POST":
      return "SHARED_POST";
    case "SHARED_STORY":
      return "SHARED_STORY";
    default:
      return "text";
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MessageItem =
  | { kind: "date"; id: string; date: string }
  | { kind: "message"; id: string; data: any; index: number };

export default function PrivateRoom() {
  const {
    roomId,
    receiverName,
    receiverUsername,
    receiverAvatar,
    conversationId,
    receiverId,
  } = useLocalSearchParams<{
    roomId: string;
    receiverName: string;
    receiverUsername?: string;
    receiverAvatar?: string;
    conversationId: string;
    receiverId: string;
  }>();

  const [record, setRecord] = useState(true);
  const [visible, setVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [showJumpToUnread, setShowJumpToUnread] = useState(true);
  const [jumpButtonRoomKey, setJumpButtonRoomKey] = useState<string | null>(
    null,
  );
  const [positionedRoomKey, setPositionedRoomKey] = useState<string | null>(
    null,
  );
  const [composerHeight, setComposerHeight] = useState(0);
  const composerHeightRef = useRef(0);
  const currentRoomKey = String(conversationId || roomId || "");
  const shouldShowJumpToUnread =
    jumpButtonRoomKey === currentRoomKey ? showJumpToUnread : true;
  const textInputRef = useRef<TextInput>(null);
  const initialScrollRoomRef = useRef<string | null>(null);
  const pendingLatestScrollRef = useRef(false);
  const pendingLatestScrollAnimatedRef = useRef(false);
  const handledIncomingVersionRef = useRef(0);
  const nearBottomRef = useRef(true);
  const userInteractedWithListRef = useRef(false);
  const keyboardWasVisibleRef = useRef(false);
  const stickToLatestOnKeyboardOpenRef = useRef(false);
  const pendingScrollViewPositionRef = useRef(0.78);
  const loadMoreInFlightRef = useRef(false);
  const [keyboardHeight] = useState(() => new Animated.Value(0));
  const [dateLabels] = useState(() => {
    const today = new Date();
    return {
      today: today.toDateString(),
      yesterday: new Date(today.getTime() - 86400000).toDateString(),
    };
  });
  const insets = useSafeAreaInsets();
  const keyboardIsVisible = useKeyboardState((state) => state.isVisible);

  useEffect(() => {
    if (keyboardIsVisible && !keyboardWasVisibleRef.current) {
      // Keep the latest message in view when the keyboard reduces the viewport,
      // but preserve the reader's position if they were viewing older messages.
      stickToLatestOnKeyboardOpenRef.current = nearBottomRef.current;
    }
    keyboardWasVisibleRef.current = keyboardIsVisible;
    if (!keyboardIsVisible) {
      stickToLatestOnKeyboardOpenRef.current = false;
    }
  }, [keyboardIsVisible]);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder);

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        showAppDialog({
          title: "Microphone access needed",
          message:
            "Enable microphone access in your device settings to record a voice message.",
          tone: "warning",
        });
        return;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;

        if (uri) {
          // send voice message here
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const currentUserToken = useAppSelector((s) => s.auth.token);
  const [isFocused, setIsFocused] = useState(false);

  const {
    messages,
    send,
    flatListRef,
    onTyping,
    sendMedia,
    isTyping,
    isSyncing,
    isOffline,
    syncError,
    loadMore,
    hasMore,
    incomingMessageVersion,
    replyMsg,
    markVisibleRead,
  } = useChat({
    roomId,
    conversationId,
    isFocused,
    currentUser: {
      id: currentUserId ?? "",
      token: currentUserToken ?? "",
    },
  });
  const previousSyncingRef = useRef(isSyncing);

  const isReceivedUnread = useCallback(
    (message: any) =>
      message.senderId !== (currentUserId ?? "") &&
      message.isRead !== true &&
      String(message.status ?? "").toUpperCase() !== "READ",
    [currentUserId],
  );

  const { firstUnreadIndex, lastUnreadIndex, unreadMessageCount } =
    useMemo(() => {
      let first = -1;
      let last = -1;
      let count = 0;

      for (let index = 0; index < messages.length; index += 1) {
        if (!isReceivedUnread(messages[index])) continue;
        if (first === -1) first = index;
        last = index;
        count += 1;
      }

      return {
        firstUnreadIndex: first,
        lastUnreadIndex: last,
        unreadMessageCount: count,
      };
    }, [messages, isReceivedUnread]);

  // Keep this callback stable across message-count changes. Otherwise the focus
  // effect is torn down and restarted for every new message.
  const requestScrollToLatest = useCallback(
    (animated = true) => {
      nearBottomRef.current = true;
      pendingLatestScrollAnimatedRef.current = animated;
      pendingLatestScrollRef.current = true;

      // The composer is absolutely positioned, so the list must not be marked
      // ready until the composer has a real measured height. onLayout below
      // retries this request as soon as that measurement exists.
      if (composerHeightRef.current <= 0) return;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!pendingLatestScrollRef.current || composerHeightRef.current <= 0)
            return;

          flatListRef.current?.scrollToEnd({
            animated: pendingLatestScrollAnimatedRef.current,
          });

          // Let React Native apply the new bottom inset/padding before the final
          // non-animated correction. Do not reveal the list until this pass.
          requestAnimationFrame(() => {
            if (
              !pendingLatestScrollRef.current ||
              composerHeightRef.current <= 0
            )
              return;
            flatListRef.current?.scrollToEnd({ animated: false });
            pendingLatestScrollRef.current = false;
            setPositionedRoomKey(currentRoomKey);
          });
        });
      });
    },
    [currentRoomKey, flatListRef],
  );

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      requestScrollToLatest(false);
      return () => setIsFocused(false);
    }, [requestScrollToLatest]),
  );

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const handleProfilePress = useCallback(() => {
    if (keyboardIsVisible) {
      Keyboard.dismiss();
      textInputRef.current?.blur();
      return;
    }

    const profileUsername = Array.isArray(receiverUsername)
      ? receiverUsername[0]
      : receiverUsername;
    if (profileUsername) {
      router.push(`/user/${profileUsername}`);
    }
  }, [keyboardIsVisible, receiverUsername]);

  const { openActionMenu } = useOverlay();

  const handleMenuPress = useCallback(
    (anchor?: { x: number; y: number; width: number; height: number }) => {
      const actions: ActionMenuItem[] = [
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
      ];
      openActionMenu(actions, anchor);
    },
    [conversationId, router, openActionMenu],
  );

  const handleMessageAction = useCallback(
    (message: any) => {
      const isOwn = message.senderId === currentUserId;
      const actions: ActionMenuItem[] = [
        {
          key: "reply",
          icon: "arrow-undo-outline",
          label: "Reply",
          onPress: () => setReplyingTo(message),
        },
        isOwn
          ? {
              key: "delete",
              icon: "trash-outline",
              label: "Delete",
              destructive: true,
              onPress: async () => {
                const deleteOptions: ActionMenuItem[] = [
                  {
                    key: "forme",
                    icon: "close-circle-outline",
                    label: "Delete for me",
                    onPress: () => mediaService.message.delete(message.id),
                  },
                  {
                    key: "everyone",
                    icon: "people-outline",
                    label: "Delete for everyone",
                    destructive: true,
                    onPress: () =>
                      mediaService.message.delete(message.id, "everyone"),
                  },
                ];
                openActionMenu(deleteOptions);
              },
            }
          : {
              key: "cannot",
              icon: "lock-closed-outline",
              label: "Cannot delete others messages",
              onPress: () => {},
            },
      ];
      openActionMenu(actions);
    },
    [currentUserId, openActionMenu],
  );

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    requestScrollToLatest(false);
    setInputText("");
    setSending(true);

    try {
      if (replyingTo) {
        await replyMsg(text, replyingTo.id, receiverId);
        setReplyingTo(null);
      } else {
        await send(text, receiverId);
      }
      requestScrollToLatest(true);
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 300);
    } finally {
      setSending(false);
    }
  }, [
    inputText,
    sending,
    send,
    replyMsg,
    receiverId,
    replyingTo,
    requestScrollToLatest,
  ]);

  const handleSendFiles = useCallback(
    async (files: PickedFile[]) => {
      requestScrollToLatest(false);
      for (const file of files) {
        await sendMedia(file.type, file.uri, receiverId);
      }
      requestScrollToLatest(true);
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 300);
    },
    [receiverId, sendMedia, requestScrollToLatest],
  );

  const handleInputChange = useCallback(
    (t: string) => {
      setRecord(t.length === 0);
      setInputText(t);
      onTyping();
    },
    [onTyping],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      const offset = Math.max(0, contentOffset.y);
      const isNearBottom =
        layoutMeasurement.height + offset >= contentSize.height - 120;
      nearBottomRef.current = isNearBottom;
      setJumpButtonRoomKey((previous) =>
        previous === currentRoomKey ? previous : currentRoomKey,
      );
      const shouldShowJump = unreadMessageCount > 0 && !isNearBottom;
      setShowJumpToUnread((previous) =>
        previous === shouldShowJump ? previous : shouldShowJump,
      );

      // Guard against repeated onScroll events starting overlapping page loads
      // before the hook has updated isSyncing.
      if (
        userInteractedWithListRef.current &&
        offset <= 72 &&
        initialScrollRoomRef.current === currentRoomKey &&
        hasMore &&
        !isSyncing &&
        !loadMoreInFlightRef.current
      ) {
        loadMoreInFlightRef.current = true;
        void (async () => {
          try {
            await loadMore();
          } catch (error) {
            console.error("Failed to load older chat messages:", error);
          } finally {
            loadMoreInFlightRef.current = false;
          }
        })();
      }
    },
    [currentRoomKey, hasMore, isSyncing, loadMore, unreadMessageCount],
  );

  const handleScrollBeginDrag = useCallback(() => {
    userInteractedWithListRef.current = true;
  }, []);

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    [],
  );

  const handleViewableItemsChanged = useCallback(
    ({ changed }: { changed: any[] }) => {
      const newlyVisibleMessageIds = changed
        .filter(
          (change) => change.isViewable && change.item?.kind === "message",
        )
        .map((change) => change.item.id as string);
      if (newlyVisibleMessageIds.length > 0 && markVisibleRead) {
        markVisibleRead(newlyVisibleMessageIds);
      }
    },
    [markVisibleRead],
  );

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    textInputRef.current?.blur();
  }, []);

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

      if (Platform.OS === "android" && stickToLatestOnKeyboardOpenRef.current) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          });
        });
      }
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
  }, [flatListRef, keyboardHeight]);

  const inputTranslateY = keyboardHeight.interpolate({
    inputRange: [0, 400],
    outputRange: [0, -420],
    extrapolate: "clamp",
  });

  // Flatten messages + date headers into one list
  const flatData = useMemo(() => {
    const items: MessageItem[] = [];
    const { today, yesterday } = dateLabels;
    let lastDate = "";

    const messageMap = new Map<string, any>();
    messages.forEach((m) => {
      if (m.id) messageMap.set(m.id, m);
      if (m.localId) messageMap.set(m.localId, m);
    });

    messages.forEach((m, idx) => {
      const ts = new Date(m.timestamp).toDateString();
      let label = ts;
      if (ts === today) label = "Today";
      else if (ts === yesterday) label = "Yesterday";

      if (label !== lastDate) {
        items.push({ kind: "date", id: `date-${ts}`, date: label });
        lastDate = label;
      }

      let repliedTo: MessageCardProps["repliedTo"] | undefined;
      if (m.repliedToId) {
        const replied = messageMap.get(m.repliedToId);
        if (replied) {
          repliedTo = {
            id: replied.id ?? replied.localId ?? m.repliedToId,
            content: replied.content ?? "",
            senderId: replied.senderId,
            type: replied.type ?? "TEXT",
            sender: replied.senderId
              ? {
                  username: replied.senderId === currentUserId ? "You" : "User",
                  avatarUrl: "",
                }
              : undefined,
          };
        } else {
          repliedTo = {
            id: m.repliedToId,
            content: "Message",
            senderId: "",
            type: "TEXT",
          };
        }
      }

      items.push({
        kind: "message",
        id:
          m.localId ??
          m.id ??
          `msg-${String(m.timestamp ?? m.conversationId ?? "unknown")}-${String(m.senderId ?? "unknown")}-${String(m.type ?? "TEXT")}-${String(m.content ?? m.mediaUrl ?? "").slice(0, 32)}`,
        // Preserve the original message object for rows that do not need a
        // synthesized reply preview, reducing unnecessary row prop changes.
        data: repliedTo ? { ...m, repliedTo } : m,
        index: idx,
      });
    });

    return items;
  }, [dateLabels, messages, currentUserId]);

  const handleInitialContentSizeChange = useCallback(() => {
    if (!pendingLatestScrollRef.current || composerHeightRef.current <= 0)
      return;

    nearBottomRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!pendingLatestScrollRef.current || composerHeightRef.current <= 0)
          return;

        flatListRef.current?.scrollToEnd({
          animated: pendingLatestScrollAnimatedRef.current,
        });

        requestAnimationFrame(() => {
          if (!pendingLatestScrollRef.current || composerHeightRef.current <= 0)
            return;
          flatListRef.current?.scrollToEnd({ animated: false });
          pendingLatestScrollRef.current = false;
          setPositionedRoomKey(currentRoomKey);
        });
      });
    });
  }, [currentRoomKey, flatListRef]);

  // Incoming messages should not drag the reader away from older history.
  useEffect(() => {
    if (incomingMessageVersion <= handledIncomingVersionRef.current) return;
    handledIncomingVersionRef.current = incomingMessageVersion;
    if (!isFocused || !nearBottomRef.current) return;

    requestScrollToLatest(true);
  }, [incomingMessageVersion, isFocused, requestScrollToLatest]);

  const lastUnreadFlatIndex = useMemo(
    () =>
      flatData.findIndex(
        (item) => item.kind === "message" && item.index === lastUnreadIndex,
      ),
    [flatData, lastUnreadIndex],
  );

  const scrollToLastUnread = useCallback(
    (animated = true) => {
      if (!flatListRef.current) return;
      if (lastUnreadFlatIndex >= 0) {
        pendingScrollViewPositionRef.current = 0.78;
        flatListRef.current.scrollToIndex({
          index: lastUnreadFlatIndex,
          animated,
          viewPosition: 0.78,
        });
      } else {
        flatListRef.current.scrollToEnd({ animated });
      }
    },
    [flatListRef, lastUnreadFlatIndex],
  );

  useEffect(() => {
    if (
      messages.length === 0 ||
      initialScrollRoomRef.current === currentRoomKey
    ) {
      return;
    }

    // New conversations always open at the latest cached page; older history
    // is fetched only after the user scrolls to the top.
    initialScrollRoomRef.current = currentRoomKey;
    userInteractedWithListRef.current = false;
    requestScrollToLatest(false);
  }, [currentRoomKey, messages.length, requestScrollToLatest]);

  useEffect(() => {
    const initialSyncJustFinished = previousSyncingRef.current && !isSyncing;
    previousSyncingRef.current = isSyncing;

    if (
      initialSyncJustFinished &&
      initialScrollRoomRef.current === currentRoomKey &&
      nearBottomRef.current
    ) {
      requestScrollToLatest(false);
    }
  }, [currentRoomKey, isSyncing, requestScrollToLatest]);

  const handleScrollToIndexFailed = useCallback(
    ({
      index,
      averageItemLength,
    }: {
      index: number;
      averageItemLength: number;
    }) => {
      const list = flatListRef.current;
      if (!list) return;
      list.scrollToOffset({
        offset: Math.max(0, averageItemLength * index),
        animated: false,
      });
      requestAnimationFrame(() => {
        list.scrollToIndex({
          index,
          animated: false,
          viewPosition: pendingScrollViewPositionRef.current,
        });
      });
    },
    [flatListRef],
  );

  const renderItem = useCallback(
    ({ item }: { item: MessageItem }) => {
      if (item.kind === "date") {
        return (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{item.date}</Text>
          </View>
        );
      }

      const m = item.data;
      const isSent = m.senderId === currentUserId;
      const showUnreadDivider =
        item.index === firstUnreadIndex && firstUnreadIndex >= 0;

      return (
        <View>
          {showUnreadDivider && (
            <View style={styles.unreadDivider}>
              <View style={styles.unreadLine} />
              <Text style={styles.unreadText}>New messages</Text>
              <View style={styles.unreadLine} />
            </View>
          )}
          <MessageCard
            message={m.content}
            time={m.timestamp}
            sender={isSent ? "You" : String(receiverName ?? "Received image")}
            isRead={m.isRead === true || m.status === "READ"}
            isSent={isSent}
            status={m.status ?? "SENT"}
            type={getMessageType(m.type)}
            uri={m.mediaUrl ?? ""}
            onLongPress={() => handleMessageAction(m)}
            repliedTo={m.repliedTo}
          />
        </View>
      );
    },
    [firstUnreadIndex, currentUserId, receiverName, handleMessageAction],
  );

  const keyExtractor = useCallback((item: MessageItem) => item.id, []);

  return (
    <View style={styles.container}>
      <OfflineBanner isOffline={isOffline} />

      {/* HEADER */}
      <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
        <View style={styles.headerWrapper}>
          <ChatHeader
            receiverName={receiverName as string}
            avatarUri={(receiverAvatar as string) || ""}
            onBack={handleBack}
            onProfilePress={handleProfilePress}
            onMenuPress={handleMenuPress}
            isTyping={isTyping}
          />
        </View>
      </SafeAreaView>

      {/* UNREAD JUMP BUTTON */}
      {shouldShowJumpToUnread && lastUnreadIndex >= 0 ? (
        <TouchableOpacity
          style={styles.jumpToUnreadTouchable}
          onPress={() => {
            nearBottomRef.current = false;
            scrollToLastUnread(true);
            setJumpButtonRoomKey(currentRoomKey);
            setShowJumpToUnread(false);
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Jump to ${unreadMessageCount} unread messages`}
        >
          <LinearGradient
            colors={[theme.COLORS.primary, theme.COLORS.accentPurple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.jumpToUnread}
          >
            <View style={styles.jumpDot} />
            <View style={styles.jumpCopy}>
              <Text style={styles.jumpEyebrow}>NEW MESSAGES</Text>
              <Text style={styles.jumpText}>
                {unreadMessageCount} unread{" "}
                {unreadMessageCount === 1 ? "message" : "messages"}
              </Text>
            </View>
            <View style={styles.jumpIconWrap}>
              <Ionicons
                name="arrow-down"
                size={17}
                color={theme.COLORS.primary}
              />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {/* Keep the message viewport above the keyboard without changing the input animation. */}
      <KeyboardAvoidingView
        style={styles.messageViewport}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        automaticOffset
      >
        {/* MESSAGES */}
        <FlatList
          ref={flatListRef}
          style={[
            styles.messageList,
            messages.length > 0 && positionedRoomKey !== currentRoomKey
              ? styles.messageListHidden
              : null,
          ]}
          data={flatData}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={handleInitialContentSizeChange}
          keyExtractor={keyExtractor}
          keyboardShouldPersistTaps="handled"
          //keyboardDismissMode="on-drag"
          contentContainerStyle={{
            // The composer floats above the list, so reserve its measured height
            // plus its bottom offset and a small visual gap. This prevents the
            // final messages from sitting underneath the input on first open.
            paddingBottom:
              composerHeight + Math.max(insets.bottom, 8) + theme.SPACING.md,
            paddingTop: theme.SPACING.md,
          }}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {!isSyncing && messages.length === 0 ? (
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
              ) : null}
            </>
          }
          ListFooterComponent={
            isSyncing && messages.length === 0 ? (
              <View style={{ paddingVertical: theme.SPACING.xl }}>
                <ChatBubbleSkeleton isOwn={false} />
                <ChatBubbleSkeleton isOwn={true} />
                <ChatBubbleSkeleton isOwn={false} />
              </View>
            ) : null
          }
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </KeyboardAvoidingView>

      {/* FLOATING INPUT */}
      <Animated.View
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          const heightChanged =
            Math.abs(composerHeightRef.current - nextHeight) > 1;
          composerHeightRef.current = nextHeight;
          setComposerHeight((previous) =>
            Math.abs(previous - nextHeight) > 1 ? nextHeight : previous,
          );
          // The first measured height is required before initial positioning.
          // Later height changes only reposition if the reader was already at
          // the bottom, so reading older messages is not interrupted.
          if (
            pendingLatestScrollRef.current ||
            (heightChanged && nearBottomRef.current)
          ) {
            requestScrollToLatest(false);
          }
        }}
        style={[
          styles.floatingInputWrapper,
          {
            bottom: Math.max(insets.bottom, 8),
            transform: [{ translateY: inputTranslateY }],
            marginBottom: keyboardIsVisible ? -8 : 0,
          },
        ]}
      >
        {replyingTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewLine} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>
                {replyingTo.senderId === currentUserId
                  ? "You"
                  : (replyingTo.sender?.username ?? "Message")}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {replyingTo.content ??
                  (replyingTo.type === "IMAGE"
                    ? "Photo"
                    : replyingTo.type === "VIDEO"
                      ? "Video"
                      : replyingTo.type === "AUDIO"
                        ? "Voice message"
                        : "Message")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setReplyingTo(null)}
              style={styles.replyPreviewClose}
            >
              <Ionicons name="close" size={18} color={theme.COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Attach media"
            onPress={() => setVisible(true)}
            style={styles.attachButton}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={22} color={theme.COLORS.primary} />
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TextInput
              ref={textInputRef}
              placeholder={replyingTo ? "Reply..." : "Message..."}
              placeholderTextColor={theme.COLORS.textMuted}
              style={styles.textInput}
              multiline
              value={inputText}
              onChangeText={handleInputChange}
              maxLength={5000}
              returnKeyType="default"
              blurOnSubmit={false}
            />
          </View>

          {record ? (
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                (pressed || status.isRecording) && styles.micButtonActive,
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Ionicons
                name={status.isRecording ? "radio-button-on" : "mic-outline"}
                size={20}
                color={theme.COLORS.white}
              />
            </Pressable>
          ) : (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={sending}
            >
              <Ionicons name="arrow-up" size={21} color={theme.COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      <MediaPickerModal
        visible={visible}
        onClose={() => setVisible(false)}
        onSend={handleSendFiles}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgMain,
  },
  headerSafeArea: {
    backgroundColor: theme.COLORS.bgWhite,
  },
  headerWrapper: {
    zIndex: 10,
    elevation: 5,
    backgroundColor: theme.COLORS.bgWhite,
  },
  messageViewport: {
    flex: 1,
  },
  messageList: {
    flex: 1,
    backgroundColor: "#F7F6FB",
  },
  messageListHidden: {
    opacity: 0,
  },
  jumpToUnreadTouchable: {
    position: "absolute",
    top: theme.SIZING.headerHeight + theme.SPACING.xxxxxl,
    left: theme.LAYOUT.contentPadding,
    right: theme.LAYOUT.contentPadding,
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
  jumpDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.COLORS.white,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
  },
  jumpCopy: {
    flex: 1,
  },
  jumpEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  jumpText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    marginTop: 1,
  },
  jumpIconWrap: {
    width: 31,
    height: 31,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.white,
  },
  dateHeader: {
    alignItems: "center",
    paddingVertical: theme.SPACING.xs,
    marginVertical: theme.SPACING.xs,
  },
  dateHeaderText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textSecondary,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
  },
  messageSeparator: {
    height: theme.SPACING.xs,
  },
  emptyState: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.xxxxxl,
    paddingVertical: theme.SPACING.xxxxl,
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
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    marginBottom: theme.SPACING.xs,
  },
  emptyStateText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    lineHeight: 20,
    textAlign: "center",
  },
  loadingMore: {
    paddingVertical: theme.SPACING.md,
    alignItems: "center",
  },
  loadingMoreText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  floatingInputWrapper: {
    position: "absolute",
    left: theme.SPACING.md,
    right: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "#EAE8F1",
    ...theme.SHADOWS.md,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: theme.SPACING.sm,
    flexDirection: "column",
    zIndex: 20,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.md,
    backgroundColor: "#F7F6FB",
    borderRadius: 14,
    paddingVertical: theme.SPACING.sm,
  },
  replyPreviewLine: {
    width: 3,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    marginRight: theme.SPACING.sm,
    alignSelf: "stretch",
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewName: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textPrimary,
  },
  replyPreviewText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textMuted,
  },
  replyPreviewClose: {
    padding: theme.SPACING.xs,
    marginLeft: theme.SPACING.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.SPACING.sm,
  },
  attachButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: "#F7F6FB",
    borderRadius: 17,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    minHeight: 43,
    justifyContent: "center",
  },
  textInput: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    color: theme.COLORS.textPrimary,
    maxHeight: 120,
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  micButtonActive: {
    transform: [{ scale: 1.2 }],
  },
  unreadDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.SPACING.lg,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
    gap: theme.SPACING.md,
  },
  unreadLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.COLORS.primaryGhostBorder,
  },
  unreadText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
