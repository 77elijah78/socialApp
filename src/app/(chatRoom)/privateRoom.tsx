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
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageCard from "@/components/messages/MessageCard";
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

export default function PrivateRoom() {
  const { roomId, receiverName, receiverAvatar, conversationId } =
    useLocalSearchParams<{
      roomId: string;
      receiverName: string;
      receiverAvatar?: string;
      conversationId: string;
    }>();

  const [record, setRecord] = useState(true);
  const [visible, setVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const textInputRef = useRef<TextInput>(null);

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

  const { messages, send, flatListRef, onTyping, sendMedia } = useChat({
    roomId,
    currentUser: {
      id: currentUserId ?? "",
      token: currentUserToken ?? "",
    },
  });

  const firstUnreadIndex = messages.findIndex(
    (m) => m.status !== "read" && m.direction === "received"
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleProfilePress = useCallback(() => {
    // TODO: navigate to profile
  }, []);

  const handleMenuPress = useCallback(() => {
    // TODO: show menu
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText("");
    setSending(true);

    try {
      await send(text, receiverName);
    } finally {
      setSending(false);
    }
  }, [inputText, sending, send, receiverName]);

  const handleSendFiles = useCallback(
    async (files: PickedFile[]) => {
      sendMedia(files[0].type, files[0].uri, conversationId);
    },
    [conversationId, sendMedia],
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

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      Animated.spring(keyboardHeight, {
        toValue: e.endCoordinates.height,
        useNativeDriver: true,
        speed: 120,
        bounciness: 0,
      }).start();
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      Animated.spring(keyboardHeight, {
        toValue: 0,
        useNativeDriver: true,
        speed: 120,
        bounciness: 0,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeight]);

  const renderMessage = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const showUnreadDivider =
        index === firstUnreadIndex && firstUnreadIndex > 0;

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
            message={item.text}
            time={item.timestamp}
            sender=""
            isRead={item.isRead}
            isSent={item.direction === "sent"}
            type={item.type}
            uri={item.mediaUrl}
          />
        </View>
      );
    },
    [firstUnreadIndex],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      {/* HEADER */}
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
      />

      {/* UNREAD JUMP BUTTON */}
      {firstUnreadIndex > 0 && (
        <TouchableOpacity
          style={styles.jumpToUnread}
          onPress={scrollToFirstUnread}
          activeOpacity={0.9}
        >
          <View style={styles.jumpDot} />
          <Text style={styles.jumpText}>Jump to new messages</Text>
          <Text style={styles.jumpChevron}>⌄</Text>
        </TouchableOpacity>
      )}

      {/* MESSAGES + INPUT */}
      <Animated.View
        style={[
          styles.contentArea,
          {
            transform: [{ translateY: Animated.multiply(keyboardHeight, -1) }],
          },
        ]}
      >
        <FlatList
          ref={flatListRef}
          style={{ flex: 1, paddingHorizontal: theme.LAYOUT.listPaddingHorizontal }}
          keyExtractor={(item) => item.localId}
          keyboardShouldPersistTaps="handled"
          data={messages}
          contentContainerStyle={{ paddingBottom: theme.SIZING.bottomBar + theme.SPACING.xxl }}
          renderItem={renderMessage}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={() => setVisible(true)} style={styles.attachButton}>
            <Image source={icons.add} style={styles.iconSmall} />
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TextInput
              ref={textInputRef}
              placeholder="Message..."
              placeholderTextColor={theme.COLORS.textMuted}
              style={styles.textInput}
              multiline
              value={inputText}
              onChangeText={(t) => {
                setRecord(t.length === 0);
                setInputText(t);
                onTyping();
              }}
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
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgMain,
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
  inputWrapper: {
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.primaryGhostBorder,
    ...theme.SHADOWS.sm,
  },
  contentArea: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    gap: theme.SPACING.sm,
  },
  attachButton: {
    width: theme.SIZING.bottomBar,
    height: theme.SIZING.bottomBar,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.xs,
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: theme.COLORS.bgInput,
    borderRadius: theme.BORDER_RADIUS.xxxxl,
    paddingHorizontal: theme.SPACING.lg,
    paddingVertical: theme.SPACING.sm,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    minHeight: theme.SIZING.bottomBar,
  },
  textInput: {
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    color: theme.COLORS.textPrimary,
    maxHeight: 100,
    lineHeight: theme.TYPOGRAPHY.lineHeight.lg,
    paddingVertical: 0,
  },
  sendButton: {
    width: theme.SIZING.sendButton,
    height: theme.SIZING.sendButton,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
    marginBottom: theme.SPACING.xs,
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
