import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { icons } from "@/constants";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Props {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export default function GoogleAuthButton({
  onPress,
  loading = false,
  disabled = false,
  label = "Continue with Google",
}: Props) {
  const unavailable = disabled || loading;
  return (
    <View style={styles.group}>
      <Pressable
        testID="google-auth-button"
        onPress={onPress}
        disabled={unavailable}
        accessibilityRole="button"
        accessibilityLabel={loading ? "Connecting to Google" : label}
        accessibilityState={{ disabled: unavailable, busy: loading }}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
          unavailable && styles.disabled,
        ]}
      >
        <Image
          source={icons.google}
          style={styles.logo}
          accessible={false}
          resizeMode="contain"
        />
        <Text style={styles.label}>
          {loading ? "Connecting to Google…" : label}
        </Text>
        {loading ? (
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
        ) : (
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACING.lg },
  button: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    borderRadius: BORDER_RADIUS.xxxxxl,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    backgroundColor: COLORS.bgWhite,
  },
  pressed: { opacity: OPACITY.subtle },
  disabled: { opacity: 0.65 },
  logo: { width: 20, height: 20 },
  label: {
    flexShrink: 1,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});
