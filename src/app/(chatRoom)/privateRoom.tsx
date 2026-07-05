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
  Platform,
  Pressable,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useState } from "react";
import MessageCard from "@/components/messages/MessageCard";
import { useChat } from "@/hooks/useChat";
import { useAppSelector } from "@/store/hooks";
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
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

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

      setRecordedUri(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    try {
      if (recorder.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        setRecordedUri(uri);

        if (uri) {
          // TODO: send voice message
        }
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
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

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

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
      try {
        sendMedia(files[0].type, files[0].uri, conversationId);
      } catch (error) {
        console.log(error);
      }
    },
    [conversationId],
  );

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: false });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
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

          <TouchableOpacity style={styles.menuButton}>
            <Image source={icons.dots} />
          </TouchableOpacity>
        </View>

        {/* MESSAGES */}
        <FlatList
          ref={flatListRef}
          style={{ flex: 1, paddingHorizontal: 15 }}
          keyExtractor={(item) => item.localId}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          data={messages}
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
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={() => setVisible(true)}>
            <Image source={icons.add} style={styles.iconSmall} />
          </TouchableOpacity>

          <View style={styles.textInputWrapper}>
            <TouchableOpacity>
              <Image source={icons.emoji} style={styles.iconSmall} />
            </TouchableOpacity>

            <TextInput
              placeholder="Message..."
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
              <Image source={icons.send} style={styles.sendIcon} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

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
    backgroundColor: "#e0e0e0",
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  backIcon: {
    width: 30,
    height: 30,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 30,
    marginLeft: 20,
  },
  userNameContainer: {
    marginLeft: 10,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  lastSeen: {
    color: "#6366f1",
  },
  menuButton: {
    position: "absolute",
    right: 10,
    width: 30,
    height: 30,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#e0e0e0",
    borderTopColor: "#aaaaaa",
    paddingVertical: 15,
  },
  textInputWrapper: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: "#fcf8ff",
    borderRadius: 15,
    paddingHorizontal: 10,
    marginRight: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    marginLeft: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366f1",
  },
  sendIcon: {
    width: 28,
    height: 28,
  },
  iconSmall: {
    width: 25,
    height: 25,
  },
  micButtonActive: {
    transform: [{ scale: 1.2 }],
  },
});
