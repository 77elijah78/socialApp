import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import theme from '@/constants/theme';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { updateUser } from '@/store/slices/authSlice';
import { api } from '@/services/api';
import { pickFromLibrary, takePhoto, showImageSourceActionSheet, createUploadFormData, getAssetMimeType, PickedAsset } from '@/hooks/useImagePicker';

export default function EditProfileScreen() {
  const user = useAppSelector((s) => s.auth.user);
  const token = useAppSelector((s) => s.auth.token);
  const dispatch = useAppDispatch();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handlePickAvatar = useCallback(async () => {
    showImageSourceActionSheet(async (action) => {
      let asset: PickedAsset | null = null;
      if (action === 'library') {
        const result = await pickFromLibrary({ allowsEditing: true, aspect: [1, 1] });
        asset = Array.isArray(result) ? result[0] ?? null : result;
      } else {
        asset = await takePhoto();
      }

      if (!asset || !token) return;

      setUploadingAvatar(true);
      try {
        const mimeType = getAssetMimeType(asset);
        const form = createUploadFormData(asset.uri, mimeType);
        const resp = await api.upload('/media/upload/avatar', form, token);
        setAvatarUrl(resp.data.url);
      } catch (err: any) {
        Alert.alert('Upload Failed', err.message || 'Could not upload avatar.');
      } finally {
        setUploadingAvatar(false);
      }
    });
  }, [token]);

  const handleSave = async () => {
    if (!token || !displayName.trim() || !username.trim()) {
      Alert.alert('Error', 'Display name and username are required.');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        displayName: displayName.trim(),
        username: username.trim(),
        bio: bio.trim() || null,
      };
      if (avatarUrl && avatarUrl !== user?.avatarUrl) {
        body.avatarUrl = avatarUrl;
      }

      const resp = await api.patch<{
        success: boolean;
        data: {
          id: string;
          username: string;
          displayName: string | null;
          bio: string | null;
          avatarUrl: string | null;
        };
      }>('/users/me', body, token);

      if (resp.success) {
        dispatch(
          updateUser({
            displayName: resp.data.displayName,
            username: resp.data.username,
            bio: resp.data.bio ?? null,
            avatarUrl: resp.data.avatarUrl ?? null,
          }),
        );
        Alert.alert('Success', 'Profile updated', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={theme.COLORS.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={styles.saveBtn}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={handlePickAvatar}
              disabled={uploadingAvatar}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={40} color={theme.COLORS.textMuted} />
                </View>
              )}
              <View style={styles.avatarEditOverlay}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={theme.COLORS.white} />
                ) : (
                  <Ionicons name="camera" size={20} color={theme.COLORS.white} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your display name"
                placeholderTextColor={theme.COLORS.textMuted}
                maxLength={50}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="username"
                placeholderTextColor={theme.COLORS.textMuted}
                autoCapitalize="none"
                maxLength={30}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself..."
                placeholderTextColor={theme.COLORS.textMuted}
                multiline
                numberOfLines={4}
                maxLength={160}
                textAlignVertical="top"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  saveBtn: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
  },
  saveBtnText: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: theme.SPACING.xl,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: theme.SPACING.xxxxl,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: theme.COLORS.bgWhite,
  },
  avatarPlaceholder: {
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.COLORS.bgWhite,
  },
  avatarHint: {
    marginTop: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textSecondary,
  },
  form: {
    paddingHorizontal: theme.LAYOUT.listPaddingHorizontal,
    gap: theme.SPACING.lg,
  },
  field: {
    gap: theme.SPACING.sm,
  },
  label: {
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    color: theme.COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.TYPOGRAPHY.letterSpacing.sm,
  },
  input: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.lg,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingVertical: theme.SPACING.md,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    color: theme.COLORS.textPrimary,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
  },
  textArea: {
    minHeight: 100,
    paddingTop: theme.SPACING.md,
  },
});
