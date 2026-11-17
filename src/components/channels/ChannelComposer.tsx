import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import MediaPickerModal from "@/components/messages/MediaPickerModal";
import StickerPickerModal from "@/components/stickers/StickerPickerModal";
import type { Sticker } from "@/constants/stickers";
import { encodeStickerMarker } from "@/constants/stickers";
import { useRateLimit } from "@/hooks/useRateLimit";
import type { PickedFile } from "@/types";
import { mediaService } from "@/services/MediaService";
import { channelService, type ChannelPostType } from "@/services/ChannelService";
import { stickerMediaForSend } from "@/services/StickerService";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Props {
  channelId: string;
  userId?: string;
  onPosted: () => void;
}

function typeForMime(mime: string): ChannelPostType {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  return "DOCUMENT";
}

export default function ChannelComposer({ channelId, userId, onPosted }: Props) {
  const [text, setText] = useState("");
  const [picker, setPicker] = useState(false);
  const [stickerPicker, setStickerPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mediaLimit = useRateLimit("media");
  const socialLimit = useRateLimit("social");
  const blocked = mediaLimit.blocked || socialLimit.blocked;

  const publishText = useCallback(async () => {
    const content = text.trim();
    if (!content || inFlight.current || sending || blocked) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    setStatus(null);
    try {
      await channelService.createPost(channelId, { content, type: "TEXT" });
      setText("");
      onPosted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t publish that post.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [blocked, channelId, onPosted, sending, text]);

  const publishFiles = useCallback(
    async (files: PickedFile[]) => {
      if (!files.length || inFlight.current || sending) return;
      if (mediaLimit.blocked || socialLimit.blocked) {
        setError(`Please wait ${mediaLimit.blocked ? mediaLimit.countdown : socialLimit.countdown} before publishing.`);
        return;
      }
      inFlight.current = true;
      setSending(true);
      setError(null);
      let published = 0;
      try {
        for (const [index, file] of files.entries()) {
          setStatus(`Uploading ${index + 1} of ${files.length}…`);
          const uploaded = await mediaService.message.uploadMedia({
            uri: file.uri,
            name: file.name,
            type: file.type,
          });
          await channelService.createPost(channelId, {
            content: index === 0 ? text.trim() || undefined : undefined,
            type: typeForMime(file.type),
            mediaUrl: uploaded.url,
            thumbnailUrl: uploaded.thumbnailUrl ?? null,
            fileName: file.name,
            fileMimeType: file.type,
            fileSize: file.size ?? uploaded.size ?? null,
            duration: file.duration ?? null,
          });
          published += 1;
        }
        setText("");
        setStatus(null);
        onPosted();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? `${published ? `${published} post${published === 1 ? "" : "s"} published. ` : ""}${failure.message}`
            : "Couldn’t publish that attachment.",
        );
        if (published) onPosted();
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    },
    [channelId, mediaLimit, onPosted, sending, socialLimit, text],
  );

  const publishSticker = useCallback(
    async (sticker: Sticker) => {
      if (inFlight.current || sending) return;
      if (mediaLimit.blocked || socialLimit.blocked) {
        setError("Please wait for the cooldown before publishing.");
        return;
      }
      inFlight.current = true;
      setSending(true);
      setError(null);
      try {
        const media = await stickerMediaForSend(sticker);
        if (!media) throw new Error("This sticker is unavailable.");
        let mediaUrl = media.mediaUri;
        if (!sticker.url) {
          const uploaded = await mediaService.message.uploadMedia({
            uri: media.mediaUri,
            name: `${sticker.id}.webp`,
            type: media.mimeType,
          });
          mediaUrl = uploaded.url;
        }
        // Standard IMAGE type keeps strict channel backends compatible; the
        // marker lets clients render artwork without a bubble or file card.
        await channelService.createPost(channelId, {
          content: encodeStickerMarker(sticker.packId, sticker.id),
          type: "IMAGE",
          mediaUrl,
          fileMimeType: media.mimeType,
          fileName: `${sticker.id}.${media.mimeType === "image/gif" ? "gif" : "webp"}`,
        });
        onPosted();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Couldn’t publish that sticker.");
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    },
    [channelId, mediaLimit.blocked, onPosted, sending, socialLimit.blocked],
  );

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <View style={styles.adminDot} />
        <Text style={styles.label}>PUBLISH TO CHANNEL</Text>
        {sending ? <ActivityIndicator size="small" color={COLORS.accentBlue} /> : null}
      </View>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(null);
        }}
        placeholder="Write an announcement…"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
        multiline
        maxLength={4000}
        editable={!sending}
        textAlignVertical="top"
      />
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">{error}</Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => setPicker(true)}
          disabled={sending || blocked}
          accessibilityRole="button"
          accessibilityLabel="Attach media to channel post"
          style={styles.actionButton}
        >
          <Ionicons name="attach" size={20} color={blocked ? COLORS.textMuted : COLORS.accentBlue} />
        </Pressable>
        <Pressable
          onPress={() => setStickerPicker(true)}
          disabled={sending || blocked}
          accessibilityRole="button"
          accessibilityLabel="Add a sticker to channel post"
          style={styles.actionButton}
        >
          <Ionicons name="happy-outline" size={20} color={blocked ? COLORS.textMuted : COLORS.accentBlue} />
        </Pressable>
        <Text style={styles.counter}>{text.length}/4000</Text>
        <Pressable
          onPress={() => void publishText()}
          disabled={!text.trim() || sending || blocked}
          accessibilityRole="button"
          accessibilityLabel="Publish post"
          style={[styles.publish, (!text.trim() || sending || blocked) && styles.publishDisabled]}
        >
          <Text style={styles.publishText}>Publish</Text>
          <Ionicons name="send" size={14} color={COLORS.textWhite} />
        </Pressable>
      </View>
      <MediaPickerModal
        visible={picker}
        onClose={() => setPicker(false)}
        onSend={(files) => void publishFiles(files)}
      />
      <StickerPickerModal
        visible={stickerPicker}
        userId={userId}
        onClose={() => setStickerPicker(false)}
        onSelect={(sticker) => void publishSticker(sticker)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.lg,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#D6E4FF",
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  adminDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accentBlue },
  label: {
    flex: 1,
    color: COLORS.accentBlue,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  input: {
    minHeight: 74,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: "#F7FAFF",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    lineHeight: 21,
  },
  status: { color: COLORS.accentBlue, fontSize: TYPOGRAPHY.fontSize.md },
  error: { color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  actionButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#F2F8FF",
  },
  counter: { flex: 1, textAlign: "right", color: COLORS.textMuted, fontSize: 9 },
  publish: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: SPACING.lg,
    borderRadius: 13,
    backgroundColor: COLORS.accentBlue,
  },
  publishDisabled: { opacity: 0.45 },
  publishText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "700" },
});
