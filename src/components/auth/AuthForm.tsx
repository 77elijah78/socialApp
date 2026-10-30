import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import AuthField from "./AuthField";
import AuthScreen from "./AuthScreen";
import PrimaryButton from "@/components/common/PrimaryButton";
import {
  BORDER_RADIUS,
  COLORS,
  OPACITY,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";
import { useAuthForm } from "@/hooks/useAuthForm";
import {
  passwordStrength,
  usernameFromName,
  type AuthMode,
} from "@/utils/authForm";

function PasswordFeedback({ password }: { password: string }) {
  const strength = passwordStrength(password);
  return (
    <View
      style={styles.strength}
      testID="password-strength"
      accessible
      accessibilityLabel={`Password strength: ${strength.label}. This is guidance, not an additional requirement.`}
    >
      <View style={styles.strengthHeading}>
        <Text style={styles.strengthLabel}>Password strength</Text>
        <Text style={styles.strengthValue}>{strength.label}</Text>
      </View>
      <View style={styles.strengthBars}>
        {[1, 2, 3].map((segment) => (
          <View
            key={segment}
            style={[
              styles.strengthBar,
              segment <= strength.score && styles.strengthBarFilled,
            ]}
          />
        ))}
      </View>
      <Text style={styles.hint}>Tip: a longer, unique password is safer.</Text>
    </View>
  );
}

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const isRegister = mode === "register";
  const { values, errors, error, isSubmitting, change, blur, submit } =
    useAuthForm(mode);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const username = usernameFromName(values.fullName);

  const handleSubmit = async () => {
    const invalid = await submit();
    if (invalid === "fullName") nameRef.current?.focus();
    else if (invalid === "email") emailRef.current?.focus();
    else if (invalid === "password") passwordRef.current?.focus();
  };

  return (
    <AuthScreen
      eyebrow={isRegister ? "YOUR NEXT CHAPTER" : "YOUR PEOPLE, CLOSER"}
      title={isRegister ? "Create an account." : "Welcome back."}
      description={
        isRegister
          ? "A space for your people and the moments that matter. Make it yours."
          : "Good conversations start here. Log in to pick up where you left off."
      }
      footer={
        <View style={styles.accountRow}>
          <Text style={styles.accountText}>
            {isRegister ? "Already a member?" : "New here?"}
          </Text>
          <Pressable
            disabled={isSubmitting}
            accessibilityRole="link"
            accessibilityLabel={
              isRegister ? "Log in instead" : "Create an account"
            }
            accessibilityState={{ disabled: isSubmitting }}
            style={({ pressed }) => [
              styles.textAction,
              pressed && styles.pressed,
            ]}
            onPress={() =>
              router.replace(isRegister ? "/(auth)/login" : "/(auth)/register")
            }
          >
            <Text style={styles.link}>
              {isRegister ? "Log in" : "Create an account"}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={COLORS.primaryDark}
              accessible={false}
            />
          </Pressable>
        </View>
      }
    >
      <View style={styles.form} testID={`${mode}-form`}>
        {isRegister ? (
          <AuthField
            ref={nameRef}
            testID="auth-full-name"
            label="Full name"
            icon="person-outline"
            placeholder="Alex Taylor"
            value={values.fullName}
            onChangeText={(value) => change("fullName", value)}
            onBlur={() => blur("fullName")}
            error={errors.fullName}
            hint={
              username
                ? `Your username will be @${username}`
                : "Your name also creates your username."
            }
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!isSubmitting}
          />
        ) : null}

        <AuthField
          ref={emailRef}
          testID="auth-email"
          label={isRegister ? "Email address" : "Email or username"}
          icon={isRegister ? "mail-outline" : "at-outline"}
          placeholder={
            isRegister ? "you@example.com" : "Your email or username"
          }
          value={values.email}
          onChangeText={(value) => change("email", value)}
          onBlur={() => blur("email")}
          error={errors.email}
          keyboardType="email-address"
          autoComplete={isRegister ? "email" : "username"}
          textContentType={isRegister ? "emailAddress" : "username"}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!isSubmitting}
        />

        <View style={styles.passwordGroup}>
          <AuthField
            ref={passwordRef}
            testID="auth-password"
            label="Password"
            icon="lock-closed-outline"
            placeholder={isRegister ? "Create a password" : "Your password"}
            value={values.password}
            onChangeText={(value) => change("password", value)}
            onBlur={() => blur("password")}
            error={errors.password}
            password
            autoComplete={isRegister ? "new-password" : "current-password"}
            textContentType={isRegister ? "newPassword" : "password"}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType={isRegister ? "done" : "go"}
            submitBehavior="submit"
            onSubmitEditing={() => void handleSubmit()}
            editable={!isSubmitting}
          />

          {isRegister ? (
            <PasswordFeedback password={values.password} />
          ) : (
            <Pressable
              onPress={() => router.push("/(auth)/forgot-password")}
              disabled={isSubmitting}
              accessibilityRole="link"
              accessibilityLabel="Forgot password?"
              accessibilityState={{ disabled: isSubmitting }}
              style={({ pressed }) => [
                styles.forgotAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          )}
        </View>

        {error ? (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={COLORS.red}
              accessible={false}
            />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>
                {isRegister
                  ? "Couldn’t create your account"
                  : "Couldn’t log you in"}
              </Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        ) : null}

        <PrimaryButton
          title={isRegister ? "Create account" : "Log in"}
          onPress={() => void handleSubmit()}
          loading={isSubmitting}
          loadingLabel={
            isRegister ? "Creating your account…" : "Logging you in…"
          }
          testID="auth-submit"
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACING.xxl },
  passwordGroup: { gap: SPACING.md },
  accountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: SPACING.sm,
  },
  accountText: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.xl,
  },
  textAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  link: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  forgotAction: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  pressed: { opacity: OPACITY.pressed },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: COLORS.dangerLight,
  },
  errorCopy: { flex: 1, minWidth: 0, gap: SPACING.sm },
  errorTitle: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  errorText: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: TYPOGRAPHY.lineHeight.md,
  },
  strength: { gap: SPACING.md },
  strengthHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  strengthLabel: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
  strengthValue: {
    color: COLORS.primaryDark,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  strengthBars: { flexDirection: "row", gap: SPACING.sm },
  strengthBar: {
    flex: 1,
    height: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.borderGray,
  },
  strengthBarFilled: { backgroundColor: COLORS.primary },
  hint: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    lineHeight: TYPOGRAPHY.lineHeight.md,
  },
});
