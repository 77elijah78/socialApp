import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/services/api";
import { StoryItem } from "@/types";
import theme from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface StoryMediaProps {
  story: StoryItem;
}

function StoryProgress({ progress }: { progress: number }) {
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function StoryMedia({ story }: StoryMediaProps) {
  const [loaded, setLoaded] = useState(false);

  const handleLoaded = () => setLoaded(true);

  return (
    <View style={styles.mediaContainer}>
      {story.mediaUrl ? (
        story.mediaType === "video" ? (
          <View style={styles.videoPlaceholder}>
            <Ionicons name="play-circle" size={64} color={theme.COLORS.white} />
            <Image
              source={{ uri: story.mediaUrl }}
              style={styles.videoThumbnail}
              resizeMode="cover"
              onLoad={handleLoaded}
            />
          </View>
        ) : (
          <Image
            source={{ uri: story.mediaUrl }}
            style={styles.media}
            resizeMode="contain"
            onLoad={handleLoaded}
          />
        )
      ) : (
        <View style={styles.media} />
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
  );
}

export default function StoryViewer({
  stories,
  initialIndex = 0,
  onIndexChange,
  onStoryViewed,
  onClose,
}: {
  stories: StoryItem[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onStoryViewed?: (storyId: string, isViewed: boolean) => void;
  onClose?: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const story = stories[activeIndex];

  // Auto-mark story as viewed immediately when it becomes active
  useEffect(() => {
    if (!story || story.id === "me") return;

    markViewed(story.id);
    onStoryViewed?.(story.id, true);
  }, [story, activeIndex]);

  // Progress timer
  useEffect(() => {
    if (!story || story.id === "me") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setProgress(0);
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 1 / 30;
        if (next >= 1) {
          goToNext();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeIndex, story]);

  function goToNext() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeIndex < stories.length - 1) {
      const newIndex = activeIndex + 1;
      setActiveIndex(newIndex);
      onIndexChange?.(newIndex);
    } else {
      onClose?.();
    }
  }

  function goToPrev() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeIndex > 0) {
      const newIndex = activeIndex - 1;
      setActiveIndex(newIndex);
      onIndexChange?.(newIndex);
    } else {
      onClose?.();
    }
  }

  const markViewed = useCallback(
    async (storyId: string) => {
      if (storyId === "me") return;
      try {
        await api.post<{ success: boolean }>(
          `/posts/stories/${storyId}/view`,
          {},
        );
      } catch (err) {
        console.error("Failed to mark story as viewed:", err);
      }
    },
    [],
  );

  if (!story) {
    return null;
  }

  const displayName = story.displayName ?? story.username ?? "Unknown";

  return (
    <View style={styles.fullScreen}>
      <View style={styles.statusBar} />
      <View style={styles.progressWrapper}>
        <StoryProgress progress={progress} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarPlaceholder}>
            {story.avatarUrl ? (
              <Image source={{ uri: story.avatarUrl }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarText}>
                {displayName[0]?.toUpperCase() ?? "?"}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.username}>{displayName}</Text>
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

      <TouchableWithoutFeedback>
        <StoryMedia story={story} />
      </TouchableWithoutFeedback>

      <View style={styles.footer}>
        <View style={styles.viewersContainer}>
          <Text style={styles.viewersText}>
            {story.isViewed ? "You and " : ""}
            {story.viewsCount ?? 0} {story.viewsCount === 1 ? "view" : "views"}
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
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  statusBar: {
    height: 40,
  },
  progressWrapper: {
    position: "absolute",
    top: 44,
    left: 0,
    right: 0,
    paddingHorizontal: 2,
    paddingBottom: 8,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: "row",
    gap: 4,
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
    marginBottom: 10,
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
    height: height - 120,
  },
  videoPlaceholder: {
    width: width,
    height: height - 120,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  videoThumbnail: {
    position: "absolute",
    width: width,
    height: height - 120,
    opacity: 0.5,
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
    bottom: 60,
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
    height: height - 200,
  },
  rightHalf: {
    position: "absolute",
    top: 80,
    right: 0,
    width: "50%",
    height: height - 200,
  },
});
