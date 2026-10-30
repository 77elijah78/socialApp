import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import AuthScreen from "@/components/auth/AuthScreen";
import PrimaryButton from "@/components/common/PrimaryButton";
import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

export default function ForgotPasswordScreen() {
  return (
    <AuthScreen
      eyebrow="ACCOUNT RECOVERY"
      title="Let’s get you back."
      description="A little help with your next step."
    >
      <View style={styles.notice}>
        <Ionicons
          name="information-circle-outline"
          size={24}
          color={COLORS.primaryDark}
          accessible={false}
        />
        <View style={styles.copy}>
          <Text style={styles.noticeTitle}>
            Password reset isn’t connected yet
          </Text>
          <Text style={styles.description}>
            This version doesn’t have a password recovery service. No reset link
            has been sent. You can return to log in with your existing password.
          </Text>
        </View>
      </View>
      <PrimaryButton
        title="Back to log in"
        onPress={() => router.replace("/(auth)/login")}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    gap: SPACING.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xxxl,
    borderRadius: BORDER_RADIUS.xxxl,
    backgroundColor: COLORS.bgAuthInput,
  },
  copy: { flex: 1, minWidth: 0, gap: SPACING.md },
  noticeTitle: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    lineHeight: TYPOGRAPHY.lineHeight.xl,
  },
});
