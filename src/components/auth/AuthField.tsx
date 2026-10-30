import React, { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SIZING,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface AuthFieldProps extends TextInputProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  error?: string;
  hint?: string;
  password?: boolean;
}

const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  {
    label,
    icon,
    error,
    hint,
    password = false,
    onFocus,
    onBlur,
    editable = true,
    style: inputStyle,
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.focused,
          error && styles.invalid,
          !editable && styles.readOnly,
        ]}
      >
        <Ionicons
          name={icon}
          size={SIZING.iconXs}
          color={
            error ? COLORS.red : focused ? COLORS.primary : COLORS.textSecondary
          }
          accessible={false}
        />
        <TextInput
          {...inputProps}
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          placeholderTextColor={COLORS.textGray}
          selectionColor={COLORS.primary}
          style={[styles.input, inputStyle]}
          editable={editable}
          secureTextEntry={password && hidden}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {password ? (
          <Pressable
            onPress={() => setHidden((previous) => !previous)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            style={({ pressed }) => [
              styles.visibility,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={SIZING.iconXs}
              color={COLORS.textSecondary}
              accessible={false}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export default AuthField;

const styles = StyleSheet.create({
  field: { gap: SPACING.md },
  label: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    minHeight: SIZING.inputHeight,
    paddingLeft: SPACING.xl,
    paddingRight: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    borderRadius: BORDER_RADIUS.xxxl,
    backgroundColor: COLORS.bgAuthInput,
  },
  focused: { borderColor: COLORS.primary, backgroundColor: COLORS.bgWhite },
  invalid: { borderColor: COLORS.red },
  readOnly: { opacity: OPACITY.subtle },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: SPACING.xl,
    paddingHorizontal: 0,
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    color: COLORS.textPrimary,
  },
  visibility: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: OPACITY.pressed },
  error: {
    color: COLORS.red,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: TYPOGRAPHY.lineHeight.md,
  },
  hint: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: TYPOGRAPHY.lineHeight.md,
  },
});
