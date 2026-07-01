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
  useWindowDimensions,
  Keyboard,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useEffect, useRef, useState } from "react";
import MessageCard from "@/components/messages/MessageCard";
import { useChat } from "@/hooks/useChat";
import { useAppSelector } from "@/store/hooks";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  AudioPlayer,
} from "expo-audio";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { PickedFile } from "@/types";
import MediaPickerModal from "@/components/messages/MediaPickerModal";

export default function PrivateRoom() {
  const { roomId, receiverName } = useLocalSearchParams<{
    roomId: string;
    receiverName: string;
    conversationId: string;
  }>();

  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
  const [record, setRecord] = useState(true);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // 1. Initialize the recorder with a preset
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // 2. This hook tracks the live state (isRecording, duration, etc.)
  const status = useAudioRecorderState(recorder);

  const startRecording = async () => {
    try {
      // Check permissions
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Enable microphone access in settings.",
        );
        return;
      }

      setRecordedUri(null);

      // Prepare and Start
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

        // Pass to your existing uploader logic here
        if (uri) {
          console.log("Audio recorded at:", uri);
          // uploadMyFile(uri);
        }
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
    }
  };

  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const currentUserToken = useAppSelector((s) => s.auth.token);

  const {
    messages,
    send,
    retry,
    deleteMsg,
    editMsg,
    loadMore,
    onTyping,
    isTyping,
    isConnected,
    isSyncing,
    hasMore,
    flatListRef,
  } = useChat({
    roomId,
    currentUser: {
      id: currentUserId ? currentUserId : "",
      token: currentUserToken ? currentUserToken : "",
    },
  });

  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [attachments, setAttachments] = useState<PickedFile[]>([]);

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

  const { width, height } = useWindowDimensions();
  const [inputMarginBottom, setInputMarginBottom] = useState(0);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (e) => {
        setInputMarginBottom(e.endCoordinates.height);
      },
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        setInputMarginBottom(0);
      },
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleSendFiles = (files: PickedFile[]) => {
    // Add to attachments list (simulate sending)
    setAttachments((prev) => [...prev, ...files]);
  };

  const removeAttachment = (uri: string) => {
    setAttachments((prev) => prev.filter((f) => f.uri !== uri));
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => {
            router.back();
          }}
        >
          <Image source={icons.leftArrow} style={styles.backIcon} />
        </TouchableOpacity>
        <TouchableOpacity>
          <Image
            source={{
              uri: "https://images.pexels.com/photos/13148612/pexels-photo-13148612.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
            }}
            style={styles.avatar}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.userNameContainer}>
          <Text style={styles.userName}>{receiverName}</Text>
          <Text style={styles.lastSeen}>Online</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ position: "absolute", right: 10, width: 30, height: 30 }}
        >
          <Image source={icons.dots} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        style={{ flex: 1, paddingHorizontal: 15 }}
        maxToRenderPerBatch={10}
        windowSize={10}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
        keyExtractor={(item) => item.localId}
        keyboardShouldPersistTaps="handled"
        data={messages}
        renderItem={(item) => {
          return (
            <MessageCard
              message={item.item.text}
              time={item.item.timestamp}
              sender={""}
              isRead={false}
              isSent={item.item.direction === "sent" ? true : false}
              type={"Voice"}
            />
          );
        }}
      />

      <View
        style={[
          styles.inputContainer,
          {
            marginBottom: inputMarginBottom,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            setVisible(true);
          }}
        >
          <Image
            source={icons.add}
            style={{ width: 25, height: 25, borderRadius: 20 }}
          />
        </TouchableOpacity>
        <View style={styles.textInputWrapper}>
          <TouchableOpacity>
            <Image
              source={icons.emoji}
              style={{ width: 25, height: 25, borderRadius: 20 }}
            />
          </TouchableOpacity>
          <TextInput
            placeholder="Message..."
            style={styles.textInput}
            multiline={true}
            numberOfLines={5}
            value={inputText}
            onChangeText={(t) => {
              setRecord(false);
              setInputText(t);
              onTyping();
            }}
          />
        </View>
        {record && (
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
              style={{ width: 25, height: 25, borderRadius: 20 }}
            />
          </Pressable>
        )}
        {!record && (
          <TouchableOpacity
            style={styles.sendButton}
            onPress={() => {
              if (inputText === "") {
                setRecord(true);
              }
              handleSend();
            }}
          >
            <Image source={icons.send} style={styles.sendIcon} />
          </TouchableOpacity>
        )}
      </View>
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
    flexDirection: "column",
    marginLeft: 10,
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  lastSeen: {
    color: "#6366f1",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 15,
    borderTopColor: "#aaaaaa",
    paddingVertical: 20,
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
    flexGrow: 1,
    flex: 1,
    marginLeft: 10,
    backgroundColor: "#fcf8ff",
    borderRadius: 15,
    marginRight: 10,
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
    width: 30,
    height: 30,
    position: "absolute",
    right: 2,
  },
  micButtonActive: {
    transform: [{ scale: 1.2 }],
  },
  micButton: {
    position: "absolute",
    right: 10,
  },
});
