import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { StoryItem } from "@/types";
import theme from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface StoryViewerProps {
  visible: boolean;
  onClose: () => void;
  stories: StoryItem[];
  initialIndex?: number;
}

function StoryProgress({
  progress,
}: {
  progress: number;
}) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);

  useEffect(() => {
    player?.play();
    return () => {
      player?.pause();
    };
  }, [player]);

  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="contain"
      nativeControls
    />
  );
}

export default function StoryViewer({
  visible,
  onClose,
  stories,
  initialIndex = 0,
}: StoryViewerProps) {
  const token = useAppSelector((s) => s.auth.token);
  const currentUserId = useAppSelector((s) => s.auth.user?.id) ?? "";
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 1 / 30;
        if (next >= 1) {
          goToNext();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeIndex, visible]);

  function goToNext() {
    if (activeIndex < stories.length - 1) {
      setActiveIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }

  function goToPrev() {
    if (activeIndex > 0) {
      setActiveIndex((prev) => prev - 1);
    }
  }

  const markViewed = async (storyId: string, mediaUrl: string) => {
    if (!token) return;
    try {
      await api.post<{ success: boolean }>(
        `/posts/stories/${storyId}/view`,
        {},
        token,
      );
    } catch (err) {
      console.error("Failed to mark story as viewed:", err);
    }
  };

  const story = stories[activeIndex];

  const handlePress = () => {
    markViewed(story.id, story.mediaUrl);
  };

  if (!story) {
    return null;
  }

  const isMine = story.userId === currentUserId || story.userId === "me";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.container}>
          <StoryProgress progress={progress} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarPlaceholder}>
                {story.avatarUrl ? (
                  <Image source={{ uri: story.avatarUrl }} style={styles.avatar} />
                ) : (
                  <Text style={styles.avatarText}>
                    {story.username?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View>
                <Text style={styles.username}>{story.displayName}</Text>
                <Text style={styles.timestamp}>
                  {new Date(story.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color={theme.COLORS.white} />
            </TouchableOpacity>
          </View>

          <TouchableWithoutFeedback onPress={handlePress}>
            <View style={styles.mediaContainer}>
              {story.mediaType === "video" ? (
                <VideoPlayer uri={story.mediaUrl} />
              ) : (
                <Image
                  source={{ uri: story.mediaUrl }}
                  style={styles.media}
                  resizeMode="contain"
                  onLoad={() => setLoaded(true)}
                />
              )}

              {!loaded && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={theme.COLORS.white} />
                </View>
              )}

              {story.caption ? (
                <View style={styles.captionContainer}>
                  <Text style={styles.caption}>{story.caption}</Text>
                </View>
              ) : null}
            </View>
          </TouchableWithoutFeedback>

          <View style={styles.footer}>
            <View style={styles.viewersContainer}>
              <Text style={styles.viewersText}>
                {story.isViewed ? "You and" : ""} {story.viewsCount} {story.viewsCount === 1 ? "view" : "views"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.leftHalf}
            onPress={goToPrev}
            activeOpacity={1}
          />
          <TouchableOpacity
            style={styles.rightHalf}
            onPress={goToNext}
            activeOpacity={1}
          />
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  progressContainer: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: theme.COLORS.white,
    borderRadius: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.COLORS.bgLight,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.COLORS.textPrimary,
  },
  username: {
    color: theme.COLORS.white,
    fontSize: 14,
    fontWeight: "600",
  },
  timestamp: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 2,
  },
  mediaContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  media: {
    width: width,
    height: height,
  },
  loadingOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  captionContainer: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xl,
  },
  caption: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: theme.SPACING.md,
    alignItems: "center",
  },
  viewersContainer: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: theme.BORDER_RADIUS.md,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
  },
  viewersText: {
    color: theme.COLORS.white,
    fontSize: 12,
  },
  leftHalf: {
    position: "absolute",
    top: 80,
    left: 0,
    width: "50%",
    height: height - 160,
  },
  rightHalf: {
    position: "absolute",
    top: 80,
    right: 0,
    width: "50%",
    height: height - 160,
  },
});
