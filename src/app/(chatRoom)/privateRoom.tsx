import { icons } from "@/constants";
import { router, useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  TextInput,
  Pressable,
  Alert,
  Keyboard,
  Platform,
  Animated,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
  const { roomId, receiverName, receiverAvatar, conversationId, receiverId } =
    useLocalSearchParams<{
      roomId: string;
      receiverName: string;
      receiverAvatar?: string;
      conversationId: string;
      receiverId: string;
    }>();

  const [record, setRecord] = useState(true);
  const [visible, setVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const textInputRef = useRef<TextInput>(null);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const screenHeight = Dimensions.get("window").height;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder);

  const startRecording = async () => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Enable microphone access in settings.",
        );
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

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const {
    messages,
    send,
    flatListRef,
    onTyping,
    sendMedia,
    isTyping,
    isSyncing,
    loadMore,
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

  const firstUnreadIndex = messages.findIndex(
    (m) => m.senderId !== (currentUserId ?? "") && m.status !== "READ",
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleProfilePress = useCallback(() => {
    // TODO: navigate to profile
  }, []);

  const handleMenuPress = useCallback(() => {
    Alert.alert(
      "Conversation options",
      "What would you like to do?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete conversation",
          style: "destructive",
          onPress: async () => {
            try {
              await mediaService.message.deleteConversation(conversationId);
              router.back();
            } catch (err) {
              Alert.alert("Error", "Could not delete conversation");
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [conversationId, router]);

  const handleMessageAction = useCallback(
    (message: any) => {
      const isOwn = message.senderId === currentUserId;
      Alert.alert(
        "Message options",
        "Choose an action",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reply",
            onPress: () => setReplyingTo(message),
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                if (isOwn) {
                  const deleteFor = Alert.alert(
                    "Delete message",
                    "Delete for everyone or only for you?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "For me",
                        onPress: () => mediaService.message.delete(message.id),
                      },
                      {
                        text: "For everyone",
                        style: "destructive",
                        onPress: () =>
                          mediaService.message.delete(message.id, "everyone"),
                      },
                    ],
                    { cancelable: true },
                  );
                } else {
                  Alert.alert(
                    "Cannot delete",
                    "You can only delete your own messages",
                  );
                }
              } catch (err) {
                Alert.alert("Error", "Could not delete message");
              }
            },
          },
        ],
        { cancelable: true },
      );
    },
    [currentUserId],
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
      sendMedia(files[0].type, files[0].uri, receiverId);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 120);
      setTimeout(() => {
        textInputRef.current?.focus();
      }, 300);
    },
    [conversationId, receiverId, sendMedia, flatListRef],
  );

  const scrollToFirstUnread = useCallback(() => {
    if (firstUnreadIndex > 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: firstUnreadIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [firstUnreadIndex]);

  const handleInputChange = useCallback(
    (t: string) => {
      setRecord(t.length === 0);
      setInputText(t);
      onTyping();
    },
    [onTyping],
  );

  const [showJumpToUnread, setShowJumpToUnread] = useState(true);

  useEffect(() => {
    if (firstUnreadIndex <= 0) {
      setShowJumpToUnread(false);
    }
  }, [firstUnreadIndex]);

  const handleScroll = useCallback(
    (event: any) => {
      if (!showJumpToUnread) return;
      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      const isNearBottom =
        layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
      if (isNearBottom && firstUnreadIndex > 0) {
        setShowJumpToUnread(false);
      }
    },
    [showJumpToUnread, firstUnreadIndex],
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: 50,
      minimumViewTime: 300,
    }),
    [],
  );

  const handleViewableItemsChanged = useCallback(
    ({ changed }: { changed: any[] }) => {
      const visibleMessageIds = changed
        .filter((c) => c.isViewable && c.item?.kind === "message")
        .map((c) => c.item.id);

      if (visibleMessageIds.length > 0 && markVisibleRead) {
        markVisibleRead(visibleMessageIds);
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
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
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
  }, [messages, currentUserId]);

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
        item.index === firstUnreadIndex && firstUnreadIndex > 0;

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
            sender=""
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
    <View style={{ flex: 1 }}>
      {/* HEADER */}
      <SafeAreaView edges={["top"]}>
        <View style={styles.headerWrapper}>
          <ChatHeader
            receiverName={receiverName as string}
            avatarUri={
              (receiverAvatar as string) ||
              "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg"
            }
            isOnline={true}
            onBack={handleBack}
            onProfilePress={handleProfilePress}
            onMenuPress={handleMenuPress}
            isTyping={isTyping}
          />
        </View>
      </SafeAreaView>

      {/* UNREAD JUMP BUTTON */}
      {showJumpToUnread && firstUnreadIndex > 0 && (
        <TouchableOpacity
          style={styles.jumpToUnread}
          onPress={() => {
            scrollToFirstUnread();
            setShowJumpToUnread(false);
          }}
          activeOpacity={0.9}
        >
          <View style={styles.jumpDot} />
          <Text style={styles.jumpText}>Jump to new messages</Text>
          <Text style={styles.jumpChevron}>⌄</Text>
        </TouchableOpacity>
      )}

      {/* MESSAGES */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
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
              <Text style={styles.emptyStateText}>No messages yet</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isSyncing ? (
            <View style={styles.loadingMore}>
              <Text style={styles.loadingMoreText}>Loading...</Text>
            </View>
          ) : null
        }
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
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
            onPress={() => setVisible(true)}
            style={styles.attachButton}
          >
            <Image source={icons.add} style={styles.iconSmall} />
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
              <Image
                source={status.isRecording ? icons.micactive : icons.mic}
                style={styles.iconSmall}
              />
            </Pressable>
          ) : (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={sending}
            >
              <Image source={icons.send} style={styles.iconSmall} />
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
  headerWrapper: {
    zIndex: 10,
    elevation: 5,
  },
  jumpToUnread: {
    position: "absolute",
    top: theme.SIZING.headerHeight + theme.SPACING.sm,
    left: theme.LAYOUT.listPaddingHorizontal,
    right: theme.LAYOUT.listPaddingHorizontal,
    backgroundColor: theme.COLORS.primary,
    paddingVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    zIndex: 10,
    ...theme.SHADOWS.primary,
  },
  jumpDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.COLORS.textWhite,
  },
  jumpText: {
    color: theme.COLORS.textWhite,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    flex: 1,
    textAlign: "center",
  },
  jumpChevron: {
    color: theme.COLORS.textWhite,
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  dateHeader: {
    alignItems: "center",
    paddingVertical: theme.SPACING.xs,
    marginVertical: theme.SPACING.xs,
  },
  dateHeaderText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textMuted,
    backgroundColor: theme.COLORS.bgLight,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
  },
  messageSeparator: {
    height: theme.SPACING.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.SPACING.xxxxl,
  },
  emptyStateText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
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
    left: theme.LAYOUT.contentPadding,
    right: theme.LAYOUT.contentPadding,
    bottom: 8,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    ...theme.SHADOWS.lg,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    flexDirection: "column",
    zIndex: 20,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.sm,
    paddingLeft: theme.SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.COLORS.primary,
    backgroundColor: theme.COLORS.bgLight,
    borderRadius: theme.BORDER_RADIUS.md,
    paddingVertical: theme.SPACING.xs,
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
  },
  attachButton: {
    width: theme.SIZING.bottomBar,
    height: theme.SIZING.bottomBar,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxxl,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.SPACING.sm,
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: theme.COLORS.bgInput,
    borderRadius: theme.BORDER_RADIUS.xxxxxxxxxl,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    minHeight: theme.SIZING.bottomBar,
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
    width: theme.SIZING.sendButton,
    height: theme.SIZING.sendButton,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
    marginLeft: theme.SPACING.sm,
  },
  iconSmall: {
    width: theme.SIZING.iconSm,
    height: theme.SIZING.iconSm,
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
