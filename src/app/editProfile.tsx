import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import theme from "@/constants/theme";
import {
  createUploadFormData,
  getAssetMimeType,
  PickedAsset,
  pickFromLibrary,
  showImageSourceActionSheet,
  takePhoto,
} from "@/hooks/useImagePicker";
import { api } from "@/services/api";
import { showAppDialog } from "@/services/AppDialogService";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateUser } from "@/store/slices/authSlice";

export default function EditProfileScreen() {
  const user = useAppSelector((state) => state.auth.user);
  const token = useAppSelector((state) => state.auth.token);
  const dispatch = useAppDispatch();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const displayNameLabel = displayName.trim() || user?.username || "Your name";
  const initial = displayNameLabel.charAt(0).toUpperCase() || "Y";

  const handlePickAvatar = useCallback(() => {
    showImageSourceActionSheet(
      async (action) => {
        let asset: PickedAsset | null = null;
        if (action === "library") {
          const result = await pickFromLibrary({ allowsEditing: true, aspect: [1, 1] });
          asset = Array.isArray(result) ? result[0] ?? null : result;
        } else {
          asset = await takePhoto();
        }

        if (!asset || !token) return;

        setUploadingAvatar(true);
        try {
          const form = createUploadFormData(asset.uri, getAssetMimeType(asset));
          const response = await api.upload("/media/upload/avatar", form, token);
          setAvatarUrl(response.data.url);
        } catch (error) {
          showAppDialog({
            title: "Photo couldn’t be uploaded",
            message: error instanceof Error ? error.message : "Please try again.",
            tone: "error",
          });
        } finally {
          setUploadingAvatar(false);
        }
      },
      {
        title: "Update your photo",
        message: "Choose a photo from your library or take a new one.",
      },
    );
  }, [token]);

  const handleSave = async () => {
    const normalizedUsername = username.trim().replace(/^@+/, "");
    if (!token) {
      showAppDialog({
        title: "Sign in required",
        message: "Please sign in again before updating your profile.",
        tone: "warning",
      });
      return;
    }

    if (!displayName.trim() || !normalizedUsername) {
      showAppDialog({
        title: "A couple of details are missing",
        message: "Display name and username are required.",
        tone: "warning",
      });
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        displayName: displayName.trim(),
        username: normalizedUsername,
        bio: bio.trim() || null,
      };
      if (avatarUrl && avatarUrl !== user?.avatarUrl) {
        body.avatarUrl = avatarUrl;
      }

      const response = await api.patch<{
        success: boolean;
        data: {
          id: string;
          username: string;
          displayName: string | null;
          bio: string | null;
          avatarUrl: string | null;
        };
      }>("/users/me", body, token);

      if (!response.success) {
        throw new Error("Your profile could not be updated. Please try again.");
      }

      dispatch(
        updateUser({
          displayName: response.data.displayName,
          username: response.data.username,
          bio: response.data.bio ?? null,
          avatarUrl: response.data.avatarUrl ?? null,
        }),
      );
      showAppDialog({
        title: "Profile updated",
        message: "Your changes are saved and ready to share.",
        tone: "success",
        buttons: [
          { key: "done", label: "Done", bold: true, onPress: () => router.back() },
        ],
      });
    } catch (error) {
      showAppDialog({
        title: "Couldn’t update your profile",
        message: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const isBusy = saving || uploadingAvatar;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={21} color={theme.COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>YOUR ACCOUNT</Text>
            <Text style={styles.headerTitle}>Edit profile</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleSave}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.saveButton,
              isBusy && styles.saveButtonBusy,
              pressed && !isBusy && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.COLORS.white} />
            ) : (
              <>
                <Text style={styles.saveButtonText}>Save</Text>
                <Ionicons name="checkmark" size={17} color={theme.COLORS.white} />
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.previewCard}>
            <LinearGradient
              colors={["#7668EA", "#9B73E8", "#CF85D8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cover}
            >
              <View style={styles.coverOrbOne} />
              <View style={styles.coverOrbTwo} />
              <View style={styles.coverCaption}>
                <Ionicons name="sparkles" size={13} color="rgba(255,255,255,0.88)" />
                <Text style={styles.coverCaptionText}>PROFILE PREVIEW</Text>
              </View>
              <Ionicons name="aperture-outline" size={25} color="rgba(255,255,255,0.78)" />
            </LinearGradient>

            <View style={styles.previewBody}>
              <View style={styles.avatarAndNameRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  onPress={handlePickAvatar}
                  disabled={isBusy}
                  style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{initial}</Text>
                    </View>
                  )}
                  <View style={styles.avatarBadge}>
                    {uploadingAvatar ? (
                      <ActivityIndicator size="small" color={theme.COLORS.white} />
                    ) : (
                      <Ionicons name="camera" size={15} color={theme.COLORS.white} />
                    )}
                  </View>
                </Pressable>
                <View style={styles.previewNameBlock}>
                  <Text style={styles.previewName} numberOfLines={1}>{displayNameLabel}</Text>
                  <Text style={styles.previewHandle} numberOfLines={1}>
                    @{username.trim().replace(/^@+/, "") || "username"}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={handlePickAvatar}
                disabled={isBusy}
                style={({ pressed }) => [styles.changePhotoButton, pressed && styles.pressed]}
              >
                <Ionicons name="image-outline" size={16} color={theme.COLORS.primary} />
                <Text style={styles.changePhotoText}>Change profile photo</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Personal details</Text>
              <Text style={styles.sectionSubtitle}>Make it easy for people to find you.</Text>
            </View>
            <View style={styles.sectionIcon}>
              <Ionicons name="person-outline" size={18} color={theme.COLORS.primary} />
            </View>
          </View>

          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                style={styles.textInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How should we call you?"
                placeholderTextColor={theme.COLORS.textMuted}
                autoCapitalize="words"
                maxLength={60}
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldDivider} />

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Username</Text>
              <View style={styles.usernameField}>
                <Text style={styles.usernamePrefix}>@</Text>
                <TextInput
                  style={[styles.textInput, styles.usernameInput]}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="yourname"
                  placeholderTextColor={theme.COLORS.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  returnKeyType="next"
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>A little about you</Text>
              <Text style={styles.sectionSubtitle}>Add a short note to your profile.</Text>
            </View>
            <View style={[styles.sectionIcon, styles.bioSectionIcon]}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.COLORS.accentPurple} />
            </View>
          </View>

          <View style={styles.bioCard}>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={setBio}
              placeholder="Share something about yourself..."
              placeholderTextColor={theme.COLORS.textMuted}
              multiline
              maxLength={160}
              textAlignVertical="top"
            />
            <View style={styles.bioFooter}>
              <View style={styles.bioHint}>
                <Ionicons name="globe-outline" size={14} color={theme.COLORS.textMuted} />
                <Text style={styles.bioHintText}>Visible on your profile</Text>
              </View>
              <Text style={styles.bioCount}>{bio.length}/160</Text>
            </View>
          </View>

          <View style={styles.privacyNote}>
            <View style={styles.privacyIcon}>
              <Ionicons name="shield-checkmark-outline" size={17} color={theme.COLORS.success} />
            </View>
            <Text style={styles.privacyText}>
              Your profile details help friends recognize you across SocialApp.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgMain,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.SPACING.xxl,
    paddingVertical: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgMain,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.COLORS.bgWhite,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  headerCopy: {
    flex: 1,
    marginLeft: theme.SPACING.md,
  },
  headerEyebrow: {
    color: theme.COLORS.textMuted,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1.15,
  },
  headerTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    marginTop: 2,
  },
  saveButton: {
    minWidth: 78,
    height: 42,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: 15,
    backgroundColor: theme.COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    ...theme.SHADOWS.primary,
  },
  saveButtonBusy: {
    opacity: 0.76,
  },
  saveButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.xxxxxxl,
  },
  previewCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ECEAF4",
    ...theme.SHADOWS.sm,
  },
  cover: {
    height: 112,
    paddingHorizontal: theme.SPACING.xl,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: theme.SPACING.lg,
    overflow: "hidden",
  },
  coverOrbOne: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.12)",
    top: -90,
    right: -26,
  },
  coverOrbTwo: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.1)",
    bottom: -58,
    left: "38%",
  },
  coverCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  coverCaptionText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 0.7,
  },
  previewBody: {
    paddingHorizontal: theme.SPACING.xl,
    paddingBottom: theme.SPACING.lg,
  },
  avatarAndNameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -30,
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 4,
    backgroundColor: theme.COLORS.white,
    ...theme.SHADOWS.md,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 34,
    backgroundColor: theme.COLORS.bgInput,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  avatarInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  avatarBadge: {
    position: "absolute",
    right: -1,
    bottom: 1,
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.COLORS.white,
    backgroundColor: theme.COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  previewNameBlock: {
    flex: 1,
    marginLeft: theme.SPACING.md,
    paddingTop: 24,
  },
  previewName: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  previewHandle: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    marginTop: 3,
  },
  changePhotoButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: theme.SPACING.md,
    paddingVertical: 8,
    paddingHorizontal: theme.SPACING.md,
    backgroundColor: theme.COLORS.primaryGhost,
    borderRadius: 12,
  },
  changePhotoText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.SPACING.xxl,
    marginBottom: theme.SPACING.md,
  },
  sectionTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sectionSubtitle: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    marginTop: 3,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  bioSectionIcon: {
    backgroundColor: "rgba(124,58,237,0.09)",
  },
  formCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: theme.SPACING.xl,
    paddingVertical: theme.SPACING.xs,
  },
  fieldGroup: {
    paddingVertical: theme.SPACING.lg,
  },
  fieldLabel: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    marginBottom: 7,
  },
  textInput: {
    minHeight: 30,
    padding: 0,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EDEBF3",
  },
  usernameField: {
    flexDirection: "row",
    alignItems: "center",
  },
  usernamePrefix: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xxl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
    marginRight: 3,
  },
  usernameInput: {
    flex: 1,
  },
  bioCard: {
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: theme.SPACING.xl,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.md,
  },
  bioInput: {
    minHeight: 98,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    lineHeight: 22,
    padding: 0,
  },
  bioFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EDEBF3",
    paddingTop: theme.SPACING.md,
  },
  bioHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bioHintText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  bioCount: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    marginTop: theme.SPACING.xl,
    padding: theme.SPACING.lg,
    borderRadius: 18,
    backgroundColor: "rgba(0,168,132,0.07)",
  },
  privacyIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,168,132,0.12)",
  },
  privacyText: {
    flex: 1,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
