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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useKeyboardState } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SavedChatPosition {
  anchorId: string | null;
  offset: number;
  anchorAtBottom: boolean;
  anchorViewPosition: number;
  savedAt: number;
}

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
  const textInputRef = useRef<TextInput>(null);
  const initialScrollRoomRef = useRef<string | null>(null);
  const positionRestoredRef = useRef(false);
  const restoreLoadInFlightRef = useRef(false);
  const restoreCursorRef = useRef<string | null>(null);
  const lastVisibleMessageRef = useRef<{
    id: string;
    anchorAtBottom: boolean;
    viewPosition: number;
  } | null>(null);
  const visibleMessageIdsRef = useRef<string[]>([]);
  const nearBottomRef = useRef(true);
  const scrollOffsetRef = useRef(0);
  const persistPositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollViewPositionRef = useRef(0.78);
  const [positionRecord, setPositionRecord] = useState<{
    key: string;
    position: SavedChatPosition | null;
  } | null>(null);
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

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder);

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        showAppDialog({
          title: "Microphone access needed",
          message: "Enable microphone access in your device settings to record a voice message.",
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
  const positionStorageKey = useMemo(
    () => `private-room-position:${currentUserId ?? "guest"}:${String(conversationId || roomId || "")}`,
    [currentUserId, conversationId, roomId],
  );
  const positionLoaded = positionRecord?.key === positionStorageKey;
  const savedPosition = positionLoaded ? positionRecord?.position ?? null : null;
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    positionRestoredRef.current = false;
    initialScrollRoomRef.current = null;
    restoreLoadInFlightRef.current = false;
    restoreCursorRef.current = null;
    lastVisibleMessageRef.current = null;
    visibleMessageIdsRef.current = [];
    scrollOffsetRef.current = 0;
    nearBottomRef.current = true;

    let cancelled = false;
    const readPosition = async () => {
      let position: SavedChatPosition | null = null;
      try {
        const raw = await AsyncStorage.getItem(positionStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SavedChatPosition>;
          if (typeof parsed.offset === "number" && Number.isFinite(parsed.offset)) {
            position = {
              anchorId: typeof parsed.anchorId === "string" ? parsed.anchorId : null,
              offset: Math.max(0, parsed.offset),
              anchorAtBottom: parsed.anchorAtBottom === true,
              anchorViewPosition:
                typeof parsed.anchorViewPosition === "number" &&
                Number.isFinite(parsed.anchorViewPosition)
                  ? Math.max(0, Math.min(1, parsed.anchorViewPosition))
                  : parsed.anchorAtBottom === true
                    ? 1
                    : 0,
              savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
            };
          }
        }
      } catch {
        // A malformed or unavailable local position should fall back to the unread/end position.
      }
      if (!cancelled) setPositionRecord({ key: positionStorageKey, position });
    };

    void readPosition();
    return () => {
      cancelled = true;
      if (restoreScrollTimerRef.current) {
        clearTimeout(restoreScrollTimerRef.current);
        restoreScrollTimerRef.current = null;
      }
    };
  }, [positionStorageKey]);

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

  const isReceivedUnread = useCallback(
    (message: any) =>
      message.senderId !== (currentUserId ?? "") &&
      message.isRead !== true &&
      String(message.status ?? "").toUpperCase() !== "READ",
    [currentUserId],
  );

  const firstUnreadIndex = useMemo(
    () => messages.findIndex(isReceivedUnread),
    [messages, isReceivedUnread],
  );
  const lastUnreadIndex = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (isReceivedUnread(messages[index])) return index;
    }
    return -1;
  }, [messages, isReceivedUnread]);
  const unreadMessageCount = useMemo(
    () => messages.reduce((count, message) => count + Number(isReceivedUnread(message)), 0),
    [messages, isReceivedUnread],
  );

  const flushSavedPosition = useCallback(
    async (offset: number) => {
      if (!positionRestoredRef.current) return;
      const visibleAnchor = lastVisibleMessageRef.current;
      const position: SavedChatPosition = {
        anchorId: visibleAnchor?.id ?? null,
        offset: Math.max(0, offset),
        anchorAtBottom: visibleAnchor?.anchorAtBottom ?? nearBottomRef.current,
        anchorViewPosition:
          visibleAnchor?.viewPosition ?? (nearBottomRef.current ? 1 : 0),
        savedAt: Date.now(),
      };
      try {
        await AsyncStorage.setItem(positionStorageKey, JSON.stringify(position));
      } catch (error) {
        console.warn("[privateRoom] could not save reading position:", error);
      }
    },
    [positionStorageKey],
  );

  const schedulePositionSave = useCallback(
    (offset: number) => {
      if (!positionRestoredRef.current) return;
      if (persistPositionTimerRef.current) {
        clearTimeout(persistPositionTimerRef.current);
      }
      persistPositionTimerRef.current = setTimeout(() => {
        persistPositionTimerRef.current = null;
        void flushSavedPosition(offset);
      }, 280);
    },
    [flushSavedPosition],
  );

  useEffect(
    () => () => {
      if (persistPositionTimerRef.current) {
        clearTimeout(persistPositionTimerRef.current);
        persistPositionTimerRef.current = null;
        void flushSavedPosition(scrollOffsetRef.current);
      }
    },
    [flushSavedPosition],
  );

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
        if (persistPositionTimerRef.current) {
          clearTimeout(persistPositionTimerRef.current);
          persistPositionTimerRef.current = null;
        }
        void flushSavedPosition(scrollOffsetRef.current);
      };
    }, [flushSavedPosition]),
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

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

  const handleMenuPress = useCallback((anchor?: { x: number; y: number; width: number; height: number }) => {
    const actions: ActionMenuItem[] = [
      { key: 'search', icon: 'search', label: 'Search', onPress: () => {} },
      { key: 'mute', icon: 'notifications-off-outline', label: 'Mute notifications', onPress: () => {} },
      { key: 'wallpaper', icon: 'image-outline', label: 'Wallpaper', onPress: () => {} },
      { key: 'delete', icon: 'trash-outline', label: 'Delete conversation', destructive: true, onPress: async () => {
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
      }},
    ];
    openActionMenu(actions, anchor);
  }, [conversationId, router, openActionMenu]);

  const handleMessageAction = useCallback(
    (message: any) => {
      const isOwn = message.senderId === currentUserId;
      const actions: ActionMenuItem[] = [
        { key: 'reply', icon: 'arrow-undo-outline', label: 'Reply', onPress: () => setReplyingTo(message) },
        isOwn ? { key: 'delete', icon: 'trash-outline', label: 'Delete', destructive: true, onPress: async () => {
          const deleteOptions: ActionMenuItem[] = [
            { key: 'forme', icon: 'close-circle-outline', label: 'Delete for me', onPress: () => mediaService.message.delete(message.id) },
            { key: 'everyone', icon: 'people-outline', label: 'Delete for everyone', destructive: true, onPress: () => mediaService.message.delete(message.id, "everyone") },
          ];
          openActionMenu(deleteOptions);
        }} : { key: 'cannot', icon: 'lock-closed-outline', label: 'Cannot delete others messages', onPress: () => {} },
      ];
      openActionMenu(actions);
    },
    [currentUserId, openActionMenu],
  );

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText("");
    setSending(true);

    try {
      if (replyingTo) {
        await replyMsg(text, replyingTo.id, receiverId);
        setReplyingTo(null);
      } else {
        await send(text, receiverId);
      }
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 300);
    } finally {
      setSending(false);
    }
  }, [inputText, sending, send, replyMsg, receiverId, flatListRef, replyingTo]);

  const handleSendFiles = useCallback(
    async (files: PickedFile[]) => {
      for (const file of files) {
        await sendMedia(file.type, file.uri, receiverId);
      }
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 300);
    },
    [receiverId, sendMedia, flatListRef],
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
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      const offset = Math.max(0, contentOffset.y);
      const isNearBottom =
        layoutMeasurement.height + offset >= contentSize.height - 120;
      scrollOffsetRef.current = offset;
      nearBottomRef.current = isNearBottom;
      const visibleIds = visibleMessageIdsRef.current;
      const anchorId = isNearBottom ? visibleIds[visibleIds.length - 1] : visibleIds[0];
      if (anchorId) {
        lastVisibleMessageRef.current = {
          id: anchorId,
          anchorAtBottom: isNearBottom,
          viewPosition: isNearBottom ? 1 : 0,
        };
      }
      schedulePositionSave(offset);

      if (unreadMessageCount === 0 || isNearBottom) {
        setShowJumpToUnread(false);
      } else {
        setShowJumpToUnread(true);
      }
    },
    [unreadMessageCount, schedulePositionSave],
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    [],
  );

  const handleViewableItemsChanged = useCallback(
    ({ changed, viewableItems }: { changed: any[]; viewableItems: any[] }) => {
      const visibleItems = viewableItems
        .filter((viewable) => viewable.isViewable && viewable.item?.kind === "message")
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((viewable) => viewable.item);
      const visibleIds = visibleItems.map((item) => item.id as string);
      visibleMessageIdsRef.current = visibleIds;

      const anchorItem = nearBottomRef.current
        ? visibleItems[visibleItems.length - 1]
        : visibleItems[0];
      if (anchorItem?.id) {
        lastVisibleMessageRef.current = {
          id: anchorItem.id as string,
          anchorAtBottom: nearBottomRef.current,
          viewPosition: nearBottomRef.current ? 1 : 0,
        };
        schedulePositionSave(scrollOffsetRef.current);
      }

      const newlyVisibleMessageIds = changed
        .filter((change) => change.isViewable && change.item?.kind === "message")
        .map((change) => change.item.id as string);
      if (newlyVisibleMessageIds.length > 0 && markVisibleRead) {
        markVisibleRead(newlyVisibleMessageIds);
      }
    },
    [markVisibleRead, schedulePositionSave],
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
        items.push({ kind: "date", id: `date-${label}-${idx}`, date: label });
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
        id: m.localId ?? m.id ?? `msg-${idx}`,
        data: { ...m, repliedTo },
        index: idx,
      });
    });

    return items;
  }, [dateLabels, messages, currentUserId]);

  const lastUnreadFlatIndex = useMemo(
    () => flatData.findIndex((item) => item.kind === "message" && item.index === lastUnreadIndex),
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
    const roomKey = String(conversationId || roomId || "");
    if (
      !roomKey ||
      !positionLoaded ||
      isSyncing ||
      positionRestoredRef.current ||
      initialScrollRoomRef.current === roomKey ||
      restoreLoadInFlightRef.current
    ) {
      return;
    }

    setShowJumpToUnread(lastUnreadIndex >= 0);

    const scheduleRestore = (viewPosition: number, scroll: () => void) => {
      initialScrollRoomRef.current = roomKey;
      pendingScrollViewPositionRef.current = viewPosition;
      visibleMessageIdsRef.current = [];
      if (restoreScrollTimerRef.current) clearTimeout(restoreScrollTimerRef.current);
      restoreScrollTimerRef.current = setTimeout(() => {
        restoreScrollTimerRef.current = null;
        if (initialScrollRoomRef.current !== roomKey) return;
        positionRestoredRef.current = true;
        scroll();
      }, 120);
    };

    if (messages.length === 0) {
      nearBottomRef.current = lastUnreadIndex < 0;
      scheduleRestore(lastUnreadIndex >= 0 ? 0.78 : 1, () => scrollToLastUnread(false));
      return;
    }

    if (savedPosition?.anchorId) {
      const anchorIndex = flatData.findIndex(
        (item) =>
          item.kind === "message" &&
          (item.id === savedPosition.anchorId ||
            item.data.id === savedPosition.anchorId ||
            item.data.localId === savedPosition.anchorId),
      );

      if (anchorIndex >= 0) {
        const viewPosition = savedPosition.anchorViewPosition;
        nearBottomRef.current = savedPosition.anchorAtBottom;
        lastVisibleMessageRef.current = {
          id: savedPosition.anchorId,
          anchorAtBottom: savedPosition.anchorAtBottom,
          viewPosition,
        };
        scheduleRestore(viewPosition, () => {
          flatListRef.current?.scrollToIndex({
            index: anchorIndex,
            animated: false,
            viewPosition,
          });
        });
        return;
      }

      if (hasMore && !syncError) {
        const oldestMessage = messages[0];
        const cursor = `${oldestMessage?.timestamp ?? ""}:${oldestMessage?.id ?? oldestMessage?.localId ?? ""}`;
        if (restoreCursorRef.current !== cursor) {
          restoreCursorRef.current = cursor;
          restoreLoadInFlightRef.current = true;
          void loadMore().finally(() => {
            restoreLoadInFlightRef.current = false;
          });
          return;
        }
      }
    }

    if (savedPosition) {
      nearBottomRef.current = savedPosition.anchorAtBottom;
      lastVisibleMessageRef.current = null;
      scheduleRestore(savedPosition.anchorViewPosition, () => {
        flatListRef.current?.scrollToOffset({
          offset: savedPosition.offset,
          animated: false,
        });
      });
      return;
    }

    nearBottomRef.current = lastUnreadIndex < 0;
    const initialAnchor = flatData.find(
      (item) =>
        item.kind === "message" &&
        item.index === (lastUnreadIndex >= 0 ? lastUnreadIndex : messages.length - 1),
    );
    lastVisibleMessageRef.current = initialAnchor
      ? {
          id: initialAnchor.id,
          anchorAtBottom: lastUnreadIndex < 0,
          viewPosition: lastUnreadIndex >= 0 ? 0.78 : 1,
        }
      : null;
    scheduleRestore(lastUnreadIndex >= 0 ? 0.78 : 1, () => scrollToLastUnread(false));
  }, [
    conversationId,
    roomId,
    positionLoaded,
    savedPosition,
    isSyncing,
    messages,
    flatData,
    hasMore,
    syncError,
    loadMore,
    lastUnreadIndex,
    scrollToLastUnread,
    flatListRef,
  ]);

  const handleScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      const list = flatListRef.current;
      if (!list) return;
      list.scrollToOffset({ offset: Math.max(0, averageItemLength * index), animated: false });
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
    [firstUnreadIndex, currentUserId],
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
      {showJumpToUnread && lastUnreadIndex >= 0 ? (
        <TouchableOpacity
          style={styles.jumpToUnreadTouchable}
          onPress={() => {
            scrollToLastUnread(true);
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
                {unreadMessageCount} unread {unreadMessageCount === 1 ? "message" : "messages"}
              </Text>
            </View>
            <View style={styles.jumpIconWrap}>
              <Ionicons name="arrow-down" size={17} color={theme.COLORS.primary} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {/* MESSAGES */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        data={flatData}
        extraData={messages}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: theme.SIZING.bottomBar + theme.SPACING.xxl + 80,
          paddingTop: theme.SPACING.md,
        }}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !isSyncing && messages.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyStateIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.COLORS.primary} />
              </View>
              <Text style={styles.emptyStateTitle}>A quiet little corner</Text>
              <Text style={styles.emptyStateText}>Send a message to start the conversation.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isSyncing && messages.length === 0 ? (
            <View style={{ paddingVertical: theme.SPACING.xl }}>
              <ChatBubbleSkeleton isOwn={false} />
              <ChatBubbleSkeleton isOwn={true} />
              <ChatBubbleSkeleton isOwn={false} />
            </View>
          ) : isSyncing && messages.length > 0 ? (
            <View style={styles.loadingMore}>
              <Text style={styles.loadingMoreText}>Loading...</Text>
            </View>
          ) : null
        }
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* FLOATING INPUT */}
      <Animated.View
        style={[
          styles.floatingInputWrapper,
          {
            bottom: Math.max(insets.bottom, 8),
            transform: [{ translateY: inputTranslateY }],
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
  messageList: {
    flex: 1,
    backgroundColor: "#F7F6FB",
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
