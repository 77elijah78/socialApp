import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAudioPlayer } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import theme from "@/constants/theme";

type MessageType = "image" | "video" | "audio" | "file";

interface Props {
  type: MessageType;
  uri: string;
  fileName?: string;
  fileSize?: string;
  duration?: string;
  isMe?: boolean;
  time?: string;
}

export default function BubbleMessage({
  type,
  uri,
  fileName,
  fileSize,
  duration,
  isMe = false,
  time,
}: Props) {
  const videoPlayer = type === "video" ? useVideoPlayer(uri) : null;

  const audioPlayer = type === "audio" ? useAudioPlayer(uri) : null;

  const toggleAudio = async () => {
    if (!audioPlayer) return;

    if (audioPlayer.playing) {
      await audioPlayer.pause();
    } else {
      await audioPlayer.play();
    }
  };

  const bubbleStyle = [
    styles.bubble,
    isMe ? styles.myBubble : styles.otherBubble,
  ];

  return (
    <View
      style={[styles.container, isMe ? styles.alignEnd : styles.alignStart]}
    >
      <View style={bubbleStyle}>
        {/* ✅ IMAGE */}
        {type === "image" && (
          <Pressable onPress={() => Linking.openURL(uri)}>
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        )}

        {/* ✅ VIDEO */}
        {type === "video" && videoPlayer && (
          <VideoView
            player={videoPlayer}
            style={styles.video}
            allowsPictureInPicture
          />
        )}

        {/* ✅ AUDIO */}
        {type === "audio" && audioPlayer && (
          <Pressable style={styles.audioRow} onPress={toggleAudio}>
            <View style={styles.playButton}>
              <Ionicons
                name={audioPlayer.playing ? "pause" : "play"}
                size={18}
                color={theme.COLORS.textWhite}
              />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.waveRow}>
                <View style={[styles.wave, { height: 6 }]} />
                <View style={[styles.wave, { height: 14 }]} />
                <View style={[styles.wave, { height: 10 }]} />
                <View style={[styles.wave, { height: 18 }]} />
                <View style={[styles.wave, { height: 8 }]} />
              </View>

              {duration && <Text style={styles.duration}>{duration}</Text>}
            </View>
          </Pressable>
        )}

        {/* ✅ FILE */}
        {type === "file" && (
          <Pressable
            style={styles.fileRow}
            onPress={() => Linking.openURL(uri)}
          >
            <View style={styles.fileIcon}>
              <Ionicons name="document" size={22} color={theme.COLORS.primary} />
            </View>

            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.fileName}>
                {fileName || "Document"}
              </Text>
              {fileSize && <Text style={styles.fileSize}>{fileSize}</Text>}
            </View>
          </Pressable>
        )}

        {/* ✅ TIME */}
        {time && <Text style={styles.time}>{time}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.lg,
  },
  alignStart: { alignItems: "flex-start" },
  alignEnd: { alignItems: "flex-end" },

  bubble: {
    maxWidth: "75%",
    borderRadius: theme.BORDER_RADIUS.xl,
    padding: theme.SPACING.sm,
  },

  myBubble: {
    backgroundColor: theme.COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },

  otherBubble: {
    backgroundColor: theme.COLORS.bgWhite,
    ...theme.SHADOWS.sm,
  },

  /* IMAGE */
  image: {
    width: theme.SIZING.messageMaxImage,
    height: theme.SIZING.messageMaxImage,
    borderRadius: theme.BORDER_RADIUS.lg,
  },

  /* VIDEO */
  video: {
    width: theme.SIZING.messageMaxImage,
    height: theme.SIZING.messageMaxImage,
    borderRadius: theme.BORDER_RADIUS.lg,
  },

  /* AUDIO */
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
  },

  playButton: {
    width: theme.SIZING.voicePlayButton,
    height: theme.SIZING.voicePlayButton,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.BORDER_RADIUS.xs,
  },

  wave: {
    width: theme.BORDER_RADIUS.sm,
    backgroundColor: theme.COLORS.wave4,
    borderRadius: theme.BORDER_RADIUS.xs,
  },

  duration: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginTop: theme.SPACING.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },

  /* FILE */
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
  },

  fileIcon: {
    width: theme.SIZING.cardHeight,
    height: theme.SIZING.cardHeight,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.primaryGhost,
    justifyContent: "center",
    alignItems: "center",
  },

  fileName: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
    color: theme.COLORS.textPrimary,
  },

  fileSize: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textMuted,
    marginTop: theme.BORDER_RADIUS.xs,
  },

  /* TIME */
  time: {
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    color: theme.COLORS.textMuted,
    alignSelf: "flex-end",
    marginTop: theme.SPACING.xs,
  },
});
