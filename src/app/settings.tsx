import React, { useCallback } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { COLORS, SPACING, TYPOGRAPHY, SHADOWS } from "@/constants/theme";
import { showAppDialog } from "@/services/AppDialogService";
import { authService } from "@/services/AuthService";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/slices/authSlice";
import { toggleNotifications } from "@/store/slices/appSlice";
import PushNotificationSettings from "@/components/notifications/PushNotificationSettings";

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  last?: boolean;
}

function SettingRow({
  icon,
  label,
  description,
  onPress,
  danger,
  right,
  last,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      style={[styles.settingRow, last && styles.settingRowLast]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.72 : 1}
    >
      <View style={styles.rowIconWrap}>
        <Ionicons
          name={icon}
          size={19}
          color={danger ? COLORS.danger : COLORS.primary}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      {right ?? (
        onPress ? (
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        ) : null
      )}
    </TouchableOpacity>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const user = useAppSelector((state) => state.auth.user);
  const notificationsEnabled = useAppSelector((state) => state.app.notificationsEnabled);
  const dispatch = useAppDispatch();
  const displayName = user?.displayName || user?.username || "Your profile";
  const initial = displayName.charAt(0).toUpperCase() || "Y";

  const handleLogout = useCallback(() => {
    showAppDialog({
      title: "Sign out of SocialApp?",
      message: "You can sign back in anytime to pick up where you left off.",
      tone: "warning",
      buttons: [
        { key: "cancel", label: "Stay signed in", cancel: true },
        {
          key: "logout",
          label: "Sign out",
          destructive: true,
          bold: true,
          icon: "log-out-outline",
          onPress: async () => {
            try {
              await authService.logout();
            } catch (error) {
              console.warn("Logout error:", error);
            } finally {
              dispatch(logout());
              await AsyncStorage.removeItem("refreshToken");
              router.replace("/(auth)/login");
            }
          },
        },
      ],
    });
  }, [dispatch]);

  const showComingSoon = useCallback((feature: string) => {
    showAppDialog({
      title: `${feature} is on the way`,
      message: "We’re polishing this part of SocialApp and will have it ready soon.",
      tone: "info",
    });
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={21} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>MAKE IT YOURS</Text>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.headerMark}>
          <Ionicons name="options-outline" size={19} color={COLORS.primary} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.accountCard}>
          <View style={styles.accountCardGlow} />
          <View style={styles.profileAvatar}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.profileImage} />
            ) : (
              <Text style={styles.profileInitial}>{initial}</Text>
            )}
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.profileUsername} numberOfLines={1}>
              @{user?.username ?? "username"}
            </Text>
          </View>
        </View>

        <SettingsSection title="Account">
          <SettingRow
            icon="person-outline"
            label="Edit profile"
            description="Your name, username and bio"
            onPress={() => router.push("/editProfile")}
          />
          <SettingRow
            icon="bookmark-outline"
            label="Saved posts"
            description="Posts you’ve bookmarked"
            onPress={() => router.push("/bookmarks")}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Privacy & safety"
            description="Manage your account privacy"
            onPress={() => showComingSoon("Privacy settings")}
            last
          />
        </SettingsSection>

        <SettingsSection title="Preferences">
          <View style={[styles.settingRow, styles.settingRowLast]}>
            <View style={styles.rowIconWrap}>
              <Ionicons name="notifications-outline" size={19} color={COLORS.primary} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>Notifications</Text>
              <Text style={styles.rowDescription}>Choose when SocialApp can reach you</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={() => {
                dispatch(toggleNotifications());
              }}
              trackColor={{
                false: "#D8D6E2",
                true: COLORS.primaryLight,
              }}
              thumbColor={notificationsEnabled ? COLORS.primary : "#FFFFFF"}
              ios_backgroundColor="#D8D6E2"
            />
          </View>
          <PushNotificationSettings />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingRow
            icon="help-circle-outline"
            label="Help center"
            description="Tips and answers to common questions"
            onPress={() => showComingSoon("The help center")}
          />
          <SettingRow
            icon="chatbubble-ellipses-outline"
            label="Send feedback"
            description="Tell us how we can make the app better"
            onPress={() => showComingSoon("Feedback")}
            last
          />
        </SettingsSection>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleLogout}
          style={styles.logoutButton}
          activeOpacity={0.78}
        >
          <View style={styles.logoutIcon}>
            <Ionicons name="log-out-outline" size={19} color={COLORS.danger} />
          </View>
          <Text style={styles.logoutText}>Sign out</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.danger} />
        </TouchableOpacity>

        <View style={styles.footer}>
          <View style={styles.footerMark}>
            <Ionicons name="sparkles" size={13} color={COLORS.primary} />
          </View>
          <Text style={styles.footerText}>SocialApp · Version 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  headerCopy: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  headerEyebrow: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1.1,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl5,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    marginTop: 2,
  },
  headerMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxxxxxl,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    backgroundColor: COLORS.bgWhite,
    borderRadius: 23,
    padding: SPACING.lg,
    marginBottom: SPACING.xxl,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    ...SHADOWS.sm,
  },
  accountCardGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(108,92,231,0.06)",
    right: -50,
    top: -68,
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  profileInitial: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.xl5,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  profileCopy: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  profileName: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  profileUsername: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.md,
    marginTop: 3,
  },
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  sectionCard: {
    backgroundColor: COLORS.bgWhite,
    borderRadius: 21,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    ...SHADOWS.sm,
  },
  settingRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECEAF4",
    gap: SPACING.md,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  rowIconWrap: {
    width: 39,
    height: 39,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
  },
  rowCopy: {
    flex: 1,
  },
  rowLabel: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  rowDescription: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
    lineHeight: 16,
    marginTop: 4,
  },
  rowDanger: {
    color: COLORS.danger,
  },
  logoutButton: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: "rgba(255,71,87,0.12)",
    borderRadius: 18,
    gap: SPACING.md,
  },
  logoutIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,71,87,0.12)",
  },
  logoutText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xxxl,
    gap: SPACING.sm,
  },
  footerMark: {
    width: 24,
    height: 24,
    borderRadius: 9,
    backgroundColor: COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
});
