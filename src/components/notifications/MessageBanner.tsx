import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AuthenticatedImage from "@/components/common/AuthenticatedImage";
import { COLORS, SHADOWS } from "@/constants/theme";
import { BANNER_DURATION, type MessageBanner as Banner } from "@/services/notifications/MessageBannerQueue";

export default function MessageBanner({ banner, onDismiss, onOpen }: {
  banner: Banner; onDismiss(key: string): void; onOpen(conversationId: string): void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0), height = useSharedValue(0), drag = useSharedValue(0);
  const horizontal = useSharedValue(0), leaving = useSharedValue(false);
  const dismiss = () => {
    if (leaving.get()) return;
    leaving.set(true);
    progress.set(withTiming(0, { duration: 180, reduceMotion: ReduceMotion.System }, finished => {
      if (finished) runOnJS(onDismiss)(banner.key);
    }));
  };
  useEffect(() => {
    const timer = setTimeout(dismiss, BANNER_DURATION);
    return () => clearTimeout(timer);
    // The key owns this lifetime. Burst previews update without resetting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner.key]);
  const pan = Gesture.Pan().minDistance(10)
    .onUpdate(event => { if (!leaving.get()) { drag.set(Math.min(0, event.translationY)); horizontal.set(event.translationX); } })
    .onEnd(event => {
      if (event.translationY < -24 || event.velocityY < -450 || Math.abs(event.translationX) > 64 || Math.abs(event.velocityX) > 650) {
        if (leaving.get()) return;
        leaving.set(true);
        progress.set(withTiming(0, { duration: 180, reduceMotion: ReduceMotion.System }, finished => {
          if (finished) runOnJS(onDismiss)(banner.key);
        }));
      } else {
        drag.set(withTiming(0, { duration: 150, reduceMotion: ReduceMotion.System })); horizontal.set(withTiming(0, { duration: 150, reduceMotion: ReduceMotion.System }));
      }
    });
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.get()) * -(height.get() + insets.top + 16) + drag.get() }, { translateX: horizontal.get() }],
    opacity: height.get() ? Math.max(0, 1 - Math.abs(horizontal.get()) / 360) : 0 }));
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8, left: Math.max(insets.left, 12), right: Math.max(insets.right, 12) }]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.banner, motion]} testID="message-banner" accessibilityLiveRegion="polite" onLayout={event => {
          const firstLayout = height.get() === 0; height.set(event.nativeEvent.layout.height);
          if (firstLayout) progress.set(withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
        }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${banner.senderName}${banner.groupName ? ` in ${banner.groupName}` : ""}: ${banner.preview}. Open conversation.`}
            onPress={() => { if (!leaving.get()) onOpen(banner.conversationId); }} style={styles.content}>
            <View style={styles.avatar}>
              {banner.avatarUrl ? <AuthenticatedImage uri={banner.avatarUrl} style={styles.image} contentFit="cover" />
                : <Text style={styles.initial}>{banner.senderName.charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={styles.copy}>
              <View style={styles.heading}>
                <Text style={styles.name} numberOfLines={1}>{banner.senderName}</Text>
                <Text style={styles.now}>now</Text>
              </View>
              {banner.groupName ? <Text style={styles.group} numberOfLines={1}>{banner.groupName}</Text> : null}
              <Text style={styles.preview} numberOfLines={2}>{banner.preview}</Text>
              {banner.count > 1 ? <Text style={styles.count}>{banner.count} new messages</Text> : null}
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message notification" hitSlop={8} onPress={dismiss} style={styles.close}>
            <Ionicons name="close" size={18} color={COLORS.textMuted} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
const styles = StyleSheet.create({
  host: { position: "absolute", zIndex: 1000, elevation: 24, alignItems: "center" },
  banner: { width: "100%", maxWidth: 560, backgroundColor: COLORS.bgWhite, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.primaryGhostBorder, flexDirection: "row", alignItems: "flex-start", ...SHADOWS.md, elevation: 12 },
  content: { flex: 1, minWidth: 0, flexDirection: "row", padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 16, overflow: "hidden", backgroundColor: COLORS.primaryGhost, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" }, initial: { fontWeight: "700", fontSize: 19, color: COLORS.primary },
  copy: { flex: 1, minWidth: 0, gap: 3 }, heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.textPrimary }, now: { fontSize: 11, color: COLORS.textMuted },
  group: { fontSize: 12, color: COLORS.primary, fontWeight: "600" }, preview: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary },
  count: { fontSize: 11, color: COLORS.primary, fontWeight: "600" }, close: { padding: 12, paddingLeft: 0 },
});
