import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChatAudioSession } from "@/hooks/useChatAudio";
import { chatAudio } from "@/services/ChatAudioPlayer";
import { COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

/**
 * Persistent session affordance shown outside the conversation. The chat
 * bubble itself is the transport inside a room, so the mini player stays out
 * of the composer's way there while audio keeps playing.
 */
export default function ChatAudioMiniPlayer() {
  const audio = useChatAudioSession();
  const pathname = usePathname();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  if (!audio.key || pathname.includes("privateRoom")) return null;
  // The tab bar is rendered inside the stack, so the session pill floats above
  // it there and directly above the home indicator everywhere else.
  const onTabs = segments[0] === "(tabs)";
  const bottom =
    Math.max(insets.bottom, 10) + (onTabs ? 78 : 0);
  const progress = audio.duration
    ? Math.max(0, Math.min(1, audio.currentTime / audio.duration))
    : 0;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: bottom }]}
    >
      <View style={styles.pill} accessibilityRole="summary"
        accessibilityLabel={`Now playing ${audio.title || "audio"}`}>
        <View style={styles.icon}>
          <Ionicons name="musical-notes" size={17} color={COLORS.white} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {audio.title || "Audio"}
          </Text>
          <View style={styles.rail}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={audio.playing ? "Pause audio" : "Play audio"}
          onPress={() => {
            if (audio.playing) chatAudio.pause();
            else
              void chatAudio.play({
                key: audio.key!,
                uri: audio.uri!,
                title: audio.title,
                subtitle: audio.subtitle,
                duration: audio.duration,
              });
          }}
          style={styles.control}
        >
          <Ionicons
            name={audio.playing ? "pause" : "play"}
            size={20}
            color={COLORS.white}
          />
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close audio player"
          onPress={() => chatAudio.close()}
          style={styles.control}
        >
          <Ionicons name="close" size={19} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.md,
  },
  pill: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 18,
    backgroundColor: "#211D3D",
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  title: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
  },
  rail: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  fill: { height: "100%", backgroundColor: COLORS.white },
  control: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
