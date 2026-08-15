import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { toggleNotifications } from '@/store/slices/appSlice';
import { authService } from '@/services/AuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';

function SettingItem({
  icon,
  label,
  onPress,
  danger,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.settingItem, !onPress && styles.settingItemDisabled]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? theme.OPACITY.pressed : 1}
    >
      <View style={styles.settingLeft}>
        <View
          style={[
            styles.settingIcon,
            danger && styles.settingIconDanger,
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={danger ? theme.COLORS.danger : theme.COLORS.textSecondary}
          />
        </View>
        <Text
          style={[
            styles.settingLabel,
            danger && styles.settingLabelDanger,
          ]}
        >
          {label}
        </Text>
      </View>
      {right}
      {onPress && !right && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.COLORS.textMuted}
        />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const notificationsEnabled = useAppSelector((s) => s.app.notificationsEnabled);
  const [darkMode, setDarkMode] = useState(false);
  const dispatch = useAppDispatch();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await authService.logout();
          } catch (err) {
            console.warn('Logout error:', err);
          } finally {
            dispatch(logout());
            await AsyncStorage.removeItem('refreshToken');
            router.replace('/(auth)/login');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.COLORS.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="person-outline"
              label="Edit Profile"
              onPress={() => router.push('/editProfile')}
            />
            <SettingItem
              icon="bookmark-outline"
              label="Bookmarks"
              onPress={() => router.push('/bookmarks')}
            />
            <SettingItem
              icon="lock-closed-outline"
              label="Privacy"
              onPress={() => {}}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.sectionCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIcon}>
                  <Ionicons
                    name="notifications-outline"
                    size={20}
                    color={theme.COLORS.textSecondary}
                  />
                </View>
                <Text style={styles.settingLabel}>Notifications</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={(value: boolean) => { dispatch(toggleNotifications()); }}
                trackColor={{
                  false: theme.COLORS.borderGray,
                  true: theme.COLORS.primaryLight,
                }}
                thumbColor={notificationsEnabled ? theme.COLORS.primary : theme.COLORS.textMuted}
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <View style={styles.settingIcon}>
                  <Ionicons
                    name="moon-outline"
                    size={20}
                    color={theme.COLORS.textSecondary}
                  />
                </View>
                <Text style={styles.settingLabel}>Dark Mode</Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{
                  false: theme.COLORS.borderGray,
                  true: theme.COLORS.primaryLight,
                }}
                thumbColor={darkMode ? theme.COLORS.primary : theme.COLORS.textMuted}
              />
            </View>
            <SettingItem
              icon="language-outline"
              label="Language"
              onPress={() => {}}
              right={<Text style={styles.rightText}>English</Text>}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="help-circle-outline"
              label="Help Center"
              onPress={() => {}}
            />
            <SettingItem
              icon="information-circle-outline"
              label="About"
              onPress={() => {}}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingItem
              icon="log-out-outline"
              label="Log Out"
              onPress={handleLogout}
              danger
            />
          </View>
        </View>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.xl7,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    color: theme.COLORS.textPrimary,
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: theme.SPACING.lg,
  },
  section: {
    marginBottom: theme.SPACING.xxxxl,
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
  },
  sectionTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.sm,
    marginBottom: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xs,
  },
  sectionCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  settingItemDisabled: {
    opacity: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.SPACING.md,
    flex: 1,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingIconDanger: {
    backgroundColor: theme.COLORS.dangerLight,
  },
  settingLabel: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    color: theme.COLORS.textPrimary,
  },
  settingLabelDanger: {
    color: theme.COLORS.danger,
  },
  rightText: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textMuted,
    marginRight: theme.SPACING.xs,
  },
  version: {
    textAlign: 'center',
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: theme.SPACING.xxxxl,
    marginBottom: theme.SPACING.xxxxl,
  },
});
