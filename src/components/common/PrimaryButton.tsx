import React from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

import type { PrimaryButtonProps } from "@/types";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SIZING,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

export default function PrimaryButton({
  style,
  title,
  onPress,
  rightIcon,
  leftIcon,
  iconStyle,
  textStyle,
  disabled = false,
  loading = false,
  loadingLabel = "Please wait…",
  accessibilityLabel,
  testID,
}: PrimaryButtonProps) {
  const unavailable = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.button, unavailable && styles.disabled, style]}
      onPress={onPress}
      activeOpacity={OPACITY.subtle}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel || (loading ? loadingLabel : title)
      }
      accessibilityState={{ disabled: unavailable, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
      ) : leftIcon ? (
        <Image
          source={leftIcon}
          style={[styles.icon, iconStyle]}
          accessible={false}
        />
      ) : null}
      <Text style={[styles.text, textStyle]}>
        {loading ? loadingLabel : title}
      </Text>
      {!loading && rightIcon ? (
        <Image
          source={rightIcon}
          style={[styles.icon, iconStyle]}
          accessible={false}
        />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: SIZING.buttonHeight,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xxxl,
    borderRadius: BORDER_RADIUS.xxxl,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  text: {
    color: COLORS.textOnPrimary,
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    textAlign: "center",
  },
  icon: { width: SIZING.iconXs, height: SIZING.iconXs },
  disabled: { opacity: OPACITY.subtle },
});
