import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useAudioPlayer } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, RADIUS, SHADOW, FONT } from "@/constants/theme";

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
  /* ================= VIDEO ================= */
  const videoPlayer = type === "video" ? useVideoPlayer(uri) : null;

  /* ================= AUDIO ================= */
  const audioPlayer = type === "audio" ? useAudioPlayer(uri) : null;

  const toggleAudio = async () => {
    if (!audioPlayer) return;

    if (audioPlayer.playing) {
      await audioPlayer.pause();
    } else {
      await audioPlayer.play();
    }
  };

  /* ================= STYLES ================= */
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
                color={COLORS.textWhite}
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
              <Ionicons name="document" size={22} color={COLORS.primary} />
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
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  alignStart: { alignItems: "flex-start" },
  alignEnd: { alignItems: "flex-end" },

  bubble: {
    maxWidth: "75%",
    borderRadius: RADIUS.xl,
    padding: SPACING.sm,
  },

  myBubble: {
    backgroundColor: COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
  },

  otherBubble: {
    backgroundColor: COLORS.bgWhite,
    ...SHADOW.sm,
  },

  /* IMAGE */
  image: {
    width: 220,
    height: 220,
    borderRadius: RADIUS.lg,
  },

  /* VIDEO */
  video: {
    width: 220,
    height: 220,
    borderRadius: RADIUS.lg,
  },

  /* AUDIO */
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },

  playButton: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  wave: {
    width: 3,
    backgroundColor: COLORS.wave4,
    borderRadius: 2,
  },

  duration: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    fontWeight: FONT.medium,
  },

  /* FILE */
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },

  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryGhost,
    justifyContent: "center",
    alignItems: "center",
  },

  fileName: {
    fontSize: 14,
    fontWeight: FONT.medium,
    color: COLORS.textPrimary,
  },

  fileSize: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  /* TIME */
  time: {
    fontSize: 10,
    color: COLORS.textMuted,
    alignSelf: "flex-end",
    marginTop: SPACING.xs,
  },
});
