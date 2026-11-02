import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

import { api, getAccessToken } from "@/services/api";
import { StoryItem } from "@/types";
import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import { useMediaSource } from "@/hooks/useMediaSource";
import { useChatMediaPlayback, claimChatPlayback } from "@/hooks/useChatMediaPlayback";
import { mediaRequestSource } from "@/utils/mediaRequests";
import * as theme from "@/constants/theme";

interface StoryMediaProps {
  story: StoryItem;
  paused: boolean;
  onVideoProgress?: (progress: number) => void;
  onVideoEnd?: () => void;
  onReady: () => void;
}

function StoryProgress({
  progress,
  stories,
  activeIndex,
}: {
  progress: number;
  stories: StoryItem[];
  activeIndex: number;
}) {
  return (
    <View style={styles.progressContainer}>
      {stories.map((story, index) => (
        <View key={story.id} style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width:
                  index < activeIndex
                    ? "100%"
                    : index === activeIndex
                      ? `${Math.min(1, Math.max(0, progress)) * 100}%`
                      : "0%",
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

function StoryMedia({ story, paused, onVideoProgress, onVideoEnd, onReady }: StoryMediaProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { isCurrent, retryAfterAuthError, ownerId, authenticated, scopeKey } = useMediaSource(story.mediaUrl);
  const player = useVideoPlayer(null, videoPlayer => {
    videoPlayer.muted = true;
    videoPlayer.timeUpdateEventInterval = 0.1;
  });
  const canPlay = useChatMediaPlayback(player, !paused);
  const loading = useRef(false);
  const pendingError = useRef<unknown>(null);
  const retryLoad = useRef<() => Promise<void>>(async () => {});
  const recover = useCallback(async (error: unknown) => {
    const retried = await retryAfterAuthError(error, () => { void retryLoad.current(); });
    if (!retried && isCurrent()) { setLoaded(true); setFailed(true); }
  }, [retryAfterAuthError, isCurrent]);
  const load = useCallback(async () => {
    if (loading.current || !isCurrent()) return;
    loading.current = true;
    pendingError.current = null;
    setLoaded(false);
    setFailed(false);
    let failure: unknown;
    try {
      const source = mediaRequestSource(story.mediaUrl, ownerId ? getAccessToken() : null);
      await player.replaceAsync({ ...source, useCaching: !authenticated });
      if (isCurrent() && player.status !== "error") {
        if (canPlay()) { claimChatPlayback(player); player.play(); }
      }
    } catch (error) { failure = error; }
    finally { loading.current = false; }
    failure ??= pendingError.current;
    if (failure) await recover(failure);
  }, [story.mediaUrl, ownerId, authenticated, isCurrent, player, canPlay, recover]);
  useEffect(() => { retryLoad.current = load; }, [load]);
  useEffect(() => {
    if (story.mediaType !== "video") return;
    const statusSubscription = player.addListener("statusChange", ({ status, error }) => {
      if (!isCurrent()) return;
      if (status === "readyToPlay") { setLoaded(true); onReady(); }
      if (status === "error") {
        if (loading.current) pendingError.current = error ?? new Error("This story video couldn’t be loaded.");
        else void recover(error);
      }
    });
    const timeSubscription = player.addListener("timeUpdate", () => {
      if (!isCurrent()) return;
      onVideoProgress?.(player.duration > 0 ? player.currentTime / player.duration : 0);
    });
    const endSubscription = player.addListener("playToEnd", () => { if (isCurrent()) onVideoEnd?.(); });
    return () => { statusSubscription.remove(); timeSubscription.remove(); endSubscription.remove(); };
  }, [player, onVideoProgress, onVideoEnd, story.mediaType, isCurrent, recover, onReady]);
  useEffect(() => {
    if (story.mediaType === "video") void retryLoad.current();
  }, [story.mediaType, scopeKey]);
  useEffect(() => {
    if (story.mediaType !== "video") return;
    if (paused || !canPlay()) player.pause();
    else if (loaded && !failed && isCurrent()) { claimChatPlayback(player); player.play(); }
  }, [paused, player, story.mediaType, loaded, failed, canPlay, isCurrent]);

  return (
    <View style={styles.mediaContainer}>
      {failed ? (
        <View style={styles.mediaError}>
          <View style={styles.mediaErrorIcon}>
            <Ionicons name="videocam-off-outline" size={25} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.mediaErrorText}>This story is unavailable</Text>
        </View>
      ) : story.mediaUrl ? (
        story.mediaType === "video" ? (
          <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} />
        ) : (
          <AuthenticatedImage
            uri={story.mediaUrl}
            style={styles.media}
            contentFit="cover"
            onLoad={() => { setLoaded(true); onReady(); }}
            onError={() => { setLoaded(true); setFailed(true); }}
          />
        )
      ) : (
        <View style={styles.mediaError}>
          <View style={styles.mediaErrorIcon}>
            <Ionicons name="images-outline" size={25} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.mediaErrorText}>No media in this story</Text>
        </View>
      )}
      {!loaded && !failed && story.mediaUrl ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={theme.COLORS.white} />
        </View>
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(5,5,10,0.14)", "transparent", "rgba(5,5,10,0.46)"]}
        locations={[0, 0.43, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export default function StoryViewer({
  stories,
  initialIndex = 0,
  onIndexChange,
  onStoryViewed,
  onClose,
  onShare,
}: {
  stories: StoryItem[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onStoryViewed?: (storyId: string, isViewed: boolean) => void;
  onClose?: () => void;
  onShare?: (story: StoryItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, Math.max(0, stories.length - 1)));
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIndexRef = useRef(safeInitialIndex);

  const story = stories[activeIndex];
  const storyId = story?.id;
  const storyMediaType = story?.mediaType;
  const mediaKey = story ? `${story.id}:${story.mediaUrl}` : "";
  const [readyKey, setReadyKey] = useState("");
  const ready = Boolean(mediaKey) && readyKey === mediaKey;
  const handleMediaReady = useCallback(() => setReadyKey(mediaKey), [mediaKey]);
  const displayName = story?.displayName ?? story?.username ?? "Unknown";

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!ready || !storyId || storyId === "me") return;

    let cancelled = false;
    const markViewed = async () => {
      try {
        const token = getAccessToken();
        if (!token) return;
        await api.post<{ success: boolean; data?: { viewed: boolean } }>(
          `/posts/stories/${storyId}/view`,
          {},
          token,
        );
        if (!cancelled) onStoryViewed?.(storyId, true);
      } catch (error) {
        if (!cancelled) console.warn("Could not mark story as viewed:", error);
      }
    };

    void markViewed();
    return () => {
      cancelled = true;
    };
  }, [storyId, ready, onStoryViewed]);

  const goToNext = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPaused(false);
    if (activeIndexRef.current < stories.length - 1) {
      const nextIndex = activeIndexRef.current + 1;
      setActiveIndex(nextIndex);
      setProgress(0);
      onIndexChange?.(nextIndex);
    } else {
      onClose?.();
    }
  }, [stories.length, onIndexChange, onClose]);

  const goToPrevious = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPaused(false);
    if (activeIndexRef.current > 0) {
      const previousIndex = activeIndexRef.current - 1;
      setActiveIndex(previousIndex);
      setProgress(0);
      onIndexChange?.(previousIndex);
    } else {
      onClose?.();
    }
  }, [onIndexChange, onClose]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!ready || !storyId || storyId === "me" || storyMediaType !== "image" || paused) return;

    timerRef.current = setInterval(() => {
      setProgress((current) => {
        const next = current + 0.02;
        if (next >= 1) {
          goToNext();
          return 1;
        }
        return next;
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeIndex, storyId, storyMediaType, ready, paused, goToNext]);

  const handleVideoProgress = useCallback((videoProgress: number) => {
    setProgress(Math.min(1, Math.max(0, videoProgress)));
  }, []);

  const handleVideoEnd = useCallback(() => goToNext(), [goToNext]);

  const handleProfilePress = () => {
    if (!story?.username) return;
    setPaused(true);
    onClose?.();
    setTimeout(() => router.push(`/user/${story.username}`), 100);
  };

  if (!story) return null;

  return (
    <View style={styles.fullScreen}>
      <View style={[styles.progressWrapper, { paddingTop: insets.top + 7 }]}>
        <StoryProgress progress={progress} stories={stories} activeIndex={activeIndex} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 25 }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Open ${displayName}'s profile`}
          onPress={handleProfilePress}
          style={styles.headerProfile}
          activeOpacity={0.82}
        >
          <LinearGradient
            colors={[theme.COLORS.primary, theme.COLORS.accentPurple]}
            style={styles.avatarRing}
          >
            <View style={styles.avatarInner}>
              {story.avatarUrl ? (
                <Image source={{ uri: story.avatarUrl }} style={styles.avatar} />
              ) : (
                <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase() || "?"}</Text>
              )}
            </View>
          </LinearGradient>
          <View style={styles.headerTextBlock}>
            <Text style={styles.username} numberOfLines={1}>{displayName}</Text>
            <View style={styles.storyMetaRow}>
              {story.username ? (
                <Text style={styles.handle} numberOfLines={1}>@{story.username}</Text>
              ) : null}
              <View style={styles.metaDot} />
              <Text style={styles.timestamp}>
                {new Date(story.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {onShare && story.id !== "me" ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Share story"
              onPress={() => onShare(story)}
              style={styles.headerIconButton}
              activeOpacity={0.75}
            >
              <Ionicons name="share-outline" size={19} color={theme.COLORS.white} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close story viewer"
            onPress={onClose}
            style={styles.headerIconButton}
            activeOpacity={0.75}
          >
            <Ionicons name="close" size={23} color={theme.COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.stage}>
        <StoryMedia
          key={story.id}
          story={story}
          paused={paused}
          onVideoProgress={handleVideoProgress}
          onVideoEnd={handleVideoEnd}
          onReady={handleMediaReady}
        />
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.leftTapZone}
            onPress={goToPrevious}
            onPressIn={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            onLongPress={() => setPaused(true)}
            delayLongPress={180}
            activeOpacity={1}
            accessibilityLabel="Previous story"
          />
          <TouchableOpacity
            style={styles.rightTapZone}
            onPress={goToNext}
            onPressIn={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            onLongPress={() => setPaused(true)}
            delayLongPress={180}
            activeOpacity={1}
            accessibilityLabel="Next story"
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 17) }]} pointerEvents="box-none">
        {story.caption ? (
          <Text style={styles.caption} numberOfLines={3}>{story.caption}</Text>
        ) : null}
        <View style={styles.viewersContainer}>
          <Ionicons name="eye-outline" size={15} color="rgba(255,255,255,0.85)" />
          <Text style={styles.viewersText}>
            {story.isViewed ? "Viewed · " : ""}
            {story.viewsCount ?? 0} {story.viewsCount === 1 ? "view" : "views"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: "#09080E",
  },
  progressWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 11,
    zIndex: 10,
  },
  progressContainer: {
    flexDirection: "row",
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.COLORS.white,
    borderRadius: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
    gap: theme.SPACING.sm,
    zIndex: 12,
  },
  headerProfile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  avatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#2D2937",
    borderWidth: 2,
    borderColor: "#09080E",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  storyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  handle: {
    maxWidth: 110,
    color: "rgba(255,255,255,0.66)",
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  timestamp: {
    color: "rgba(255,255,255,0.66)",
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  stage: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    backgroundColor: "#14111C",
    overflow: "hidden",
  },
  mediaContainer: {
    flex: 1,
    width: "100%",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(9,8,14,0.22)",
  },
  mediaError: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#17131F",
    gap: theme.SPACING.md,
  },
  mediaErrorIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaErrorText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  tapZones: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    zIndex: 2,
  },
  leftTapZone: {
    flex: 1,
  },
  rightTapZone: {
    flex: 1,
  },
  footer: {
    minHeight: 62,
    paddingHorizontal: theme.SPACING.xl,
    paddingTop: theme.SPACING.md,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    zIndex: 3,
  },
  caption: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  viewersContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: theme.BORDER_RADIUS.full,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
  },
  viewersText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
});
