import React from "react";
import { StatusBar, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  BORDER_RADIUS,
  COLORS,
  SIZING,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface AuthScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// One scroll/keyboard owner, no fixed-height card or separately moving footer.
// All form controls, error messages and navigation links remain scrollable.
export default function AuthScreen({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "right", "bottom", "left"]}
    >
      <StatusBar barStyle="dark-content" />
      <KeyboardAwareScrollView
        mode="insets"
        bottomOffset={SPACING.xl}
        extraKeyboardSpace={-insets.bottom}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <View style={styles.brand} accessible accessibilityLabel="Social App">
            <View style={styles.brandMark}>
              <Ionicons
                name="chatbubbles"
                size={SIZING.iconSm}
                color={COLORS.textOnPrimary}
                accessible={false}
              />
            </View>
            <Text style={styles.wordmark}>Social App</Text>
          </View>

          <View style={styles.introduction}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.description}>{description}</Text>
          </View>

          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgWhite },
  scrollContent: { flexGrow: 1 },
  content: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    paddingHorizontal: SPACING.xxxl,
    paddingTop: SPACING.xxxl,
    paddingBottom: SPACING.xxxxxxl,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: SPACING.lg },
  brandMark: {
    width: SIZING.avatarMd,
    height: SIZING.avatarMd,
    borderRadius: BORDER_RADIUS.xxxl,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl5,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -TYPOGRAPHY.letterSpacing.xs,
  },
  introduction: { marginTop: SPACING.xxxxxxl, marginBottom: SPACING.xxxxl },
  eyebrow: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: TYPOGRAPHY.letterSpacing.sm,
    marginBottom: SPACING.lg,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl9,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: -TYPOGRAPHY.letterSpacing.xs,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.xxxl,
    lineHeight: TYPOGRAPHY.lineHeight.xxl,
    marginTop: SPACING.lg,
  },
  footer: {
    marginTop: SPACING.xxxxl,
    paddingTop: SPACING.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderGray,
  },
});
