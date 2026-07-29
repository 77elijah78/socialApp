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
  useWindowDimensions,
  Keyboard,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const { roomId, receiverName, conversationId } = useLocalSearchParams<{
    roomId: string;
    receiverName: string;
    conversationId: string;
  }>();

  const [record, setRecord] = useState(true);
  const [visible, setVisible] = useState(false);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const keyboardHeight = useRef(new Animated.Value(0)).current;

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
    [conversationId],
  );

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      Animated.spring(keyboardHeight, {
        toValue: e.endCoordinates.height,
        useNativeDriver: true,
        speed: 100,
        bounciness: 0,
      }).start();
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      Animated.spring(keyboardHeight, {
        toValue: 0,
        useNativeDriver: true,
        speed: 100,
        bounciness: 0,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeight]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      {/* HEADER */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()}>
          <Image source={icons.leftArrow} style={styles.backIcon} />
        </TouchableOpacity>

        <Image
          source={{
            uri: "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg",
          }}
          style={styles.avatar}
        />

        <View style={styles.userNameContainer}>
          <Text style={styles.userName}>{receiverName}</Text>
          <Text style={styles.lastSeen}>Online</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        style={{ flex: 1, paddingHorizontal: theme.LAYOUT.listPaddingHorizontal }}
        keyExtractor={(item) => item.localId}
        keyboardShouldPersistTaps="handled"
        data={messages}
        contentContainerStyle={{ paddingBottom: theme.SIZING.bottomBar + theme.SPACING.xxl }}
        renderItem={({ item }) => (
          <MessageCard
            message={item.text}
            time={item.timestamp}
            sender=""
            isRead={false}
            isSent={item.direction === "sent"}
            type={item.type}
            uri={item.mediaUrl}
          />
        )}
      />

      {/* INPUT */}
      <Animated.View
        style={[
          styles.inputWrapper,
          {
            transform: [{ translateY: Animated.multiply(keyboardHeight, -1) }],
          },
        ]}
      >
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={() => setVisible(true)} style={styles.attachButton}>
            <Image source={icons.add} style={styles.iconSmall} />
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TextInput
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
    backgroundColor: theme.COLORS.bgLight,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.primaryGhostBorder,
    ...theme.SHADOWS.sm,
  },
  backIcon: {
    width: theme.SIZING.iconMd,
    height: theme.SIZING.iconMd,
  },
  avatar: {
    width: theme.SIZING.avatarLg,
    height: theme.SIZING.avatarLg,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    marginLeft: theme.SPACING.xxl,
  },
  userNameContainer: {
    marginLeft: theme.SPACING.lg,
  },
  userName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
  },
  lastSeen: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.online,
    marginTop: theme.SPACING.xs,
  },
  inputWrapper: {
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.primaryGhostBorder,
    ...theme.SHADOWS.sm,
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
});
