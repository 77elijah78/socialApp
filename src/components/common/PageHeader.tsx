import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
  transparent?: boolean;
}

export default function PageHeader({
  title,
  subtitle,
  right,
  onBack,
  transparent = false,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + SPACING.sm },
        transparent && styles.transparent,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={10}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/messages")))}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
      </Pressable>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.bgMain,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(26,26,46,0.08)",
  },
  transparent: { backgroundColor: "transparent", borderBottomWidth: 0 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  pressed: { opacity: 0.7 },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl5,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  subtitle: {
    marginTop: 1,
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  right: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
});
