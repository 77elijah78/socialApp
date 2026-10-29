import { memo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import type { MessageRow } from "@/db/schema";
import type { PickedFile } from "@/types";
import theme from "@/constants/theme";
import { showAppDialog } from "@/services/AppDialogService";
import MediaPickerModal from "../messages/MediaPickerModal";

interface Props {
  replyingTo: MessageRow | null;
  userId: string;
  onCancelReply: () => void;
  onTyping: () => void;
  onSend: (text: string, replyId?: string) => Promise<void>;
  onSendMedia: (type: string, uri: string, duration?: number) => Promise<void>;
}
function ChatComposer({
  replyingTo,
  userId,
  onCancelReply,
  onTyping,
  onSend,
  onSendMedia,
}: Props) {
  const [text, setText] = useState("");
  const draft = useRef("");
  const [picker, setPicker] = useState(false);
  const input = useRef<TextInput>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recording = useAudioRecorderState(recorder);
  const recordingHeld = useRef(false);
  const preparing = useRef(false);

  const failed = () =>
    showAppDialog({
      title: "Message not sent",
      message:
        "Messages with a Failed label are saved in this conversation. Tap Retry to send them again.",
      tone: "error",
    });
  const send = async () => {
    const value = draft.current.trim();
    if (!value) return;
    // Clear synchronously: a double tap cannot resubmit the same draft, but a
    // different message never waits for the previous network acknowledgement.
    draft.current = "";
    setText("");
    onCancelReply();
    try {
      await onSend(value, replyingTo?.id ?? undefined);
    } catch {
      failed();
    }
  };
  const stopRecording = async () => {
    recordingHeld.current = false;
    if (!recorder.isRecording) return;
    try {
      const duration = recording.durationMillis / 1000;
      await recorder.stop();
      if (recorder.uri) await onSendMedia("audio/mp4", recorder.uri, duration);
    } catch {
      failed();
    }
  };
  const startRecording = async () => {
    recordingHeld.current = true;
    if (preparing.current || recorder.isRecording) return;
    preparing.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        showAppDialog({
          title: "Microphone access needed",
          message:
            "Enable microphone access in device settings to record a voice message.",
          tone: "warning",
        });
        return;
      }
      if (!recordingHeld.current) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
      // Releasing while permissions/preparation were pending must not leave an
      // invisible recorder running indefinitely.
      if (!recordingHeld.current) await stopRecording();
    } catch {
      failed();
    } finally {
      preparing.current = false;
    }
  };
  const sendFiles = async (files: PickedFile[]) => {
    setPicker(false);
    try {
      await Promise.all(files.map((file) => onSendMedia(file.type, file.uri)));
    } catch {
      failed();
    }
  };
  return (
    <>
      <View style={styles.floatingInputWrapper} testID="chat-composer">
        {replyingTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewLine} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>
                {replyingTo.senderId === userId ? "You" : "Message"}
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
              accessibilityLabel="Cancel reply"
              onPress={onCancelReply}
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
            onPress={() => setPicker(true)}
            style={styles.attachButton}
          >
            <Ionicons name="add" size={22} color={theme.COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.textInputWrapper}>
            <TextInput
              ref={input}
              placeholder={replyingTo ? "Reply..." : "Message..."}
              placeholderTextColor={theme.COLORS.textMuted}
              style={styles.textInput}
              multiline
              value={text}
              onChangeText={(value) => {
                draft.current = value;
                setText(value);
                onTyping();
              }}
              maxLength={5000}
              returnKeyType="default"
              submitBehavior="newline"
            />
          </View>
          {!text.trim() ? (
            <Pressable
              accessibilityLabel="Hold to record a voice message"
              style={[
                styles.sendButton,
                recording.isRecording && styles.micButtonActive,
              ]}
              onPressIn={() => {
                void startRecording();
              }}
              onPressOut={() => {
                void stopRecording();
              }}
            >
              <Ionicons
                name={recording.isRecording ? "radio-button-on" : "mic-outline"}
                size={20}
                color={theme.COLORS.white}
              />
            </Pressable>
          ) : (
            <TouchableOpacity
              accessibilityLabel="Send message"
              style={styles.sendButton}
              onPress={() => {
                void send();
              }}
            >
              <Ionicons name="arrow-up" size={21} color={theme.COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <MediaPickerModal
        visible={picker}
        onClose={() => setPicker(false)}
        onSend={(files) => {
          void sendFiles(files);
        }}
      />
    </>
  );
}
export default memo(ChatComposer);
const styles = StyleSheet.create({
  floatingInputWrapper: {
    marginHorizontal: theme.SPACING.md,
    marginVertical: theme.SPACING.sm,
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
});
