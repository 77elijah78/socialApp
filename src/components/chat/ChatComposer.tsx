import { memo, useRef, useState, useEffect, useContext, useLayoutEffect } from "react";
import {
  View,
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
import type { AttachmentInfo } from "@/utils/messaging/presentation";
import { replyPreview } from "@/utils/messaging/presentation";
import { ChatReadVisibility } from "./ChatReadVisibility";
import ReplyPreview from "../messages/ReplyPreview";
import type { PickedFile } from "@/types";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { showAppDialog } from "@/services/AppDialogService";
import MediaPickerModal from "../messages/MediaPickerModal";

interface Props {
  replyingTo: MessageRow | null;
  disabled?: boolean;
  userId: string;
  onCancelReply: () => void;
  onTyping: () => void;
  onSend: (text: string, replyId?: string) => Promise<void>;
  onSendMedia: (
    type: string,
    uri: string,
    duration?: number,
    replyId?: string,
    attachment?: AttachmentInfo,
  ) => Promise<void>;
  onReplyPress?: (id: string) => void;
}
function ChatComposer({
  replyingTo,
  disabled = false,
  userId,
  onCancelReply,
  onTyping,
  onSend,
  onSendMedia,
  onReplyPress,
}: Props) {
  const [text, setText] = useState("");
  const draft = useRef("");
  const disabledRef = useRef(disabled);
  useLayoutEffect(() => { disabledRef.current = disabled; }, [disabled]);
  const [picker, setPicker] = useState(false);
  // Adjust derived sheet state before committing a disabled composer. Keeping
  // the composer itself mounted preserves the draft and avoids a layout jump.
  if (disabled && picker) setPicker(false);
  const coverReads = useContext(ChatReadVisibility);
  const releasePicker = useRef<(() => void) | null>(null);
  const closePicker = () => {
    setPicker(false);
    releasePicker.current?.();
    releasePicker.current = null;
  };
  useEffect(() => () => releasePicker.current?.(), []);
  const input = useRef<TextInput>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recording = useAudioRecorderState(recorder);
  const recordingHeld = useRef(false);
  const preparing = useRef(false);
  const stopping = useRef(false);
  const recordingReplyId = useRef<string | undefined>(undefined);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      recordingHeld.current = false;
    },
    [],
  );

  const failed = () =>
    alive.current &&
    showAppDialog({
      title: "Message not sent",
      message:
        "Messages with a Failed label are saved in this conversation. Tap Retry to send them again.",
      tone: "error",
    });
  const send = async () => {
    const value = draft.current.trim();
    if (!value || disabledRef.current) return;
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
    if (!recorder.isRecording || stopping.current) return;
    stopping.current = true;
    try {
      const duration = recording.durationMillis / 1000;
      await recorder.stop();
      if (recorder.uri && alive.current && !disabledRef.current) {
        const replyId = recordingReplyId.current;
        onCancelReply();
        await onSendMedia("audio/mp4", recorder.uri, duration, replyId);
      }
    } catch {
      failed();
    } finally {
      stopping.current = false;
    }
  };
  const startRecording = async () => {
    if (disabledRef.current) return;
    recordingHeld.current = true;
    if (preparing.current || recorder.isRecording) return;
    preparing.current = true;
    recordingReplyId.current = replyingTo?.id ?? undefined;
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
      if (!recordingHeld.current || !alive.current) return;
      await recorder.prepareToRecordAsync();
      if (!alive.current) return;
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
    closePicker();
    if (disabledRef.current) return;
    const replyId = replyingTo?.id ?? undefined;
    onCancelReply();
    try {
      await Promise.all(
        files.map((file) =>
          onSendMedia(file.type, file.uri, file.duration, replyId, {
            name: file.name,
            size: file.size,
            mimeType: file.type,
            width: file.width,
            height: file.height,
          }),
        ),
      );
    } catch {
      failed();
    }
  };
  useEffect(() => {
    if (!disabled) return;
    recordingHeld.current = false;
    releasePicker.current?.();
    releasePicker.current = null;
    if (recorder.isRecording) void recorder.stop().catch(() => {});
  }, [disabled, recorder]);
  const replyIdentity = replyingTo?.localId;
  useEffect(() => {
    if (replyIdentity && !disabled) input.current?.focus();
  }, [replyIdentity, disabled]);
  return (
    <>
      <View style={[styles.floatingInputWrapper, disabled && styles.disabled]} testID="chat-composer">
        {replyingTo && (
          <View style={styles.replyPreview}>
            <ReplyPreview
              message={replyPreview(replyingTo)}
              userId={userId}
              onPress={onReplyPress}
              compact
            />
            <TouchableOpacity
              accessibilityLabel="Cancel reply"
              disabled={disabled}
              onPress={onCancelReply}
              style={styles.replyPreviewClose}
            >
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Attach media"
            disabled={disabled}
            onPress={() => {
              if (disabledRef.current) return;
              releasePicker.current?.();
              releasePicker.current = coverReads();
              setPicker(true);
            }}
            style={styles.attachButton}
          >
            <Ionicons name="add" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <View style={styles.textInputWrapper}>
            <TextInput
              ref={input}
              placeholder={replyingTo ? "Reply..." : "Message..."}
              placeholderTextColor={COLORS.textMuted}
              style={styles.textInput}
              multiline
              editable={!disabled}
              value={text}
              onChangeText={(value) => {
                if (disabledRef.current) return;
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
              disabled={disabled}
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
                color={COLORS.white}
              />
            </Pressable>
          ) : (
            <TouchableOpacity
              accessibilityLabel="Send message"
              disabled={disabled}
              style={styles.sendButton}
              onPress={() => {
                void send();
              }}
            >
              <Ionicons name="arrow-up" size={21} color={COLORS.white} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <MediaPickerModal
        visible={picker}
        onClose={closePicker}
        onSend={(files) => {
          void sendFiles(files);
        }}
      />
    </>
  );
}
export default memo(ChatComposer);
const styles = StyleSheet.create({
  disabled: { opacity: 0.55 },
  floatingInputWrapper: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    backgroundColor: COLORS.bgWhite,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "#EAE8F1",
    ...SHADOWS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    flexDirection: "column",
    zIndex: 20,
  },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: "#F7F6FB",
    borderRadius: 14,
    paddingVertical: SPACING.sm,
  },
  replyPreviewLine: {
    width: 3,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    marginRight: SPACING.sm,
    alignSelf: "stretch",
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewName: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.textPrimary,
  },
  replyPreviewText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.textMuted,
  },
  replyPreviewClose: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
  },
  attachButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: "#F7F6FB",
    borderRadius: 17,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    minHeight: 43,
    justifyContent: "center",
  },
  textInput: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    color: COLORS.textPrimary,
    maxHeight: 120,
    lineHeight: TYPOGRAPHY.lineHeight.lg,
    paddingVertical: 0,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    ...SHADOWS.primary,
  },
  micButtonActive: {
    transform: [{ scale: 1.2 }],
  },
});
