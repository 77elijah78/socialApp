import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, SHADOWS, SPACING, TYPOGRAPHY } from "@/constants/theme";
import {
  formatCooldown,
  type RateLimitNotice,
  rateLimitStore,
} from "@/services/RateLimitService";

/**
 * One global cooldown surface. It is informational only: the backend rejects
 * requests, this banner explains when the next one can succeed. Rendered above
 * navigation so every screen sees the same countdown.
 */
export default function RateLimitBanner() {
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<RateLimitNotice | null>(() =>
    rateLimitStore.current(),
  );
  const [remaining, setRemaining] = useState(() => {
    const current = rateLimitStore.current();
    return current ? Math.max(0, current.blockedUntil - Date.now()) : 0;
  });

  useEffect(() => {
    const unsubscribe = rateLimitStore.subscribe((next) => {
      setNotice(next);
      setRemaining(next ? Math.max(0, next.blockedUntil - Date.now()) : 0);
    });
    const timer = setInterval(() => {
      const next = rateLimitStore.current();
      setNotice(next);
      setRemaining(next ? Math.max(0, next.blockedUntil - Date.now()) : 0);
    }, 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  if (!notice || remaining <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + SPACING.sm }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.banner} accessibilityRole="alert">
        <View style={styles.iconWrap}>
          <Ionicons name="time-outline" size={18} color={COLORS.textWhite} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Easy there</Text>
          <Text style={styles.message} numberOfLines={2}>
            {notice.message}
          </Text>
        </View>
        <View style={styles.countdown}>
          <Text style={styles.countdownText}>{formatCooldown(remaining)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 1000,
    elevation: 20,
  },
  banner: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 18,
    backgroundColor: COLORS.textPrimary,
    ...SHADOWS.lg,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: COLORS.textWhite,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  message: {
    marginTop: 1,
    color: "rgba(255,255,255,0.76)",
    fontSize: TYPOGRAPHY.fontSize.md,
    lineHeight: 16,
  },
  countdown: {
    minWidth: 48,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
  },
  countdownText: {
    color: COLORS.textWhite,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    fontVariant: ["tabular-nums"],
  },
});
