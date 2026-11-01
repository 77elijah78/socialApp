import { useMediaSource } from "@/hooks/useMediaSource";
import { isAuthenticatedMediaUrl } from "@/utils/mediaRequests";
import { shareMediaFile } from "@/services/MediaSharing";
import { fileNameFromUri } from "@/utils/messaging/presentation";
import { showAppDialog } from "@/services/AppDialogService";
import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import { useLocalSearchParams, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as theme from "@/constants/theme";

// Reanimated gesture worklets intentionally mutate shared values.
/* eslint-disable react-hooks/immutability */

export default function ImageViewerScreen() {
  const params = useLocalSearchParams<{ uri?: string; name?: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const name = Array.isArray(params.name) ? params.name[0] : params.name;
  const media = useMediaSource(uri);
  const sharing = useRef(false);
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(Boolean(uri));
  const [imageError, setImageError] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate((event) => {
        scale.value = Math.min(4, Math.max(1, savedScale.value * event.scale));
      })
      .onEnd(() => {
        if (scale.value < 1.04) {
          scale.value = 1;
          savedScale.value = 1;
          translateX.value = 0;
          translateY.value = 0;
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        } else {
          savedScale.value = scale.value;
        }
      });

    const pan = Gesture.Pan()
      .minDistance(2)
      .onUpdate((event) => {
        if (savedScale.value > 1.02) {
          const maxX = (viewportWidth * (savedScale.value - 1)) / 2;
          const maxY = (viewportHeight * (savedScale.value - 1)) / 2;
          translateX.value = Math.max(
            -maxX,
            Math.min(maxX, savedTranslateX.value + event.translationX),
          );
          translateY.value = Math.max(
            -maxY,
            Math.min(maxY, savedTranslateY.value + event.translationY),
          );
        }
      })
      .onEnd(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        if (scale.value > 1.02) {
          scale.value = 1;
          savedScale.value = 1;
          translateX.value = 0;
          translateY.value = 0;
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        } else {
          scale.value = 2.25;
          savedScale.value = 2.25;
        }
      });

    return Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
  }, [
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    viewportWidth,
    viewportHeight,
  ]);

  const handleShare = async () => {
    if (!uri || sharing.current || !media.isCurrent()) return;
    sharing.current = true;
    try {
      if (isAuthenticatedMediaUrl(media.source.uri)) {
        if (!media.ownerId) throw new Error("Sign in again to share this photo.");
        await shareMediaFile({ ownerId: media.ownerId, id: media.source.uri, uri: media.source.uri,
          name: fileNameFromUri(media.source.uri) });
      } else await Share.share({ title: "Share photo", message: uri, url: uri });
    } catch {
      if (media.isCurrent()) showAppDialog({ title: "Couldn’t share photo",
        message: "The original file may be unavailable. Please retry.", tone: "error" });
    } finally { sharing.current = false; }
  };

  if (!uri) return null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close photo viewer"
          onPress={() => router.back()}
          style={styles.iconButton}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={23} color={theme.COLORS.white} />
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>PHOTO</Text>
          <Text style={styles.title} numberOfLines={1}>{name || "Received image"}</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Share photo"
          onPress={() => void handleShare()}
          style={styles.iconButton}
          activeOpacity={0.75}
        >
          <Ionicons name="share-outline" size={20} color={theme.COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.viewerStage}>
        {imageError ? (
          <View style={styles.stateBlock}>
            <View style={styles.stateIcon}>
              <Ionicons name="image-outline" size={27} color="rgba(255,255,255,0.8)" />
            </View>
            <Text style={styles.stateTitle}>This photo can’t be opened</Text>
            <Text style={styles.stateCopy}>It may have expired or is unavailable right now.</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.backAction} activeOpacity={0.8}>
              <Text style={styles.backActionText}>Back to chat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <GestureDetector gesture={gesture}>
            <View style={styles.gestureArea}>
              <Animated.View style={[styles.zoomLayer, zoomStyle]}>
                <AuthenticatedImage
                  uri={uri}
                  style={styles.image}
                  contentFit="contain"
                  transition={180}
                  cachePolicy="memory-disk"
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setImageError(true);
                  }}
                />
              </Animated.View>
              {loading ? (
                <View style={styles.loadingOverlay} pointerEvents="none">
                  <ActivityIndicator size="large" color={theme.COLORS.white} />
                  <Text style={styles.loadingText}>Opening photo…</Text>
                </View>
              ) : null}
            </View>
          </GestureDetector>
        )}
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {!imageError ? (
          <View style={styles.zoomHint}>
            <Ionicons name="scan-outline" size={15} color="rgba(255,255,255,0.78)" />
            <Text style={styles.zoomHintText}>Pinch or double-tap to zoom</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#08080D",
  },
  topBar: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.lg,
    paddingBottom: theme.SPACING.sm,
    gap: theme.SPACING.md,
    zIndex: 2,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    marginTop: 3,
  },
  viewerStage: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  gestureArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomLayer: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,8,13,0.22)",
  },
  loadingText: {
    marginTop: theme.SPACING.md,
    color: "rgba(255,255,255,0.78)",
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  stateBlock: {
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxxxxl,
  },
  stateIcon: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.SPACING.lg,
  },
  stateTitle: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    textAlign: "center",
  },
  stateCopy: {
    color: "rgba(255,255,255,0.62)",
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    textAlign: "center",
    marginTop: theme.SPACING.sm,
    lineHeight: 20,
  },
  backAction: {
    marginTop: theme.SPACING.xl,
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  backActionText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  bottomBar: {
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: theme.SPACING.md,
    zIndex: 2,
  },
  zoomHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  zoomHintText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
});
