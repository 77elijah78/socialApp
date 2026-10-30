import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";

import theme from "@/constants/theme";
import {
  createUploadFormData,
  getAssetMimeType,
  PickedAsset,
  pickFromLibrary,
  takePhoto,
} from "@/hooks/useImagePicker";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import { showAppDialog } from "@/services/AppDialogService";

const MAX_IMAGES = 4;

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.auth.user);
  const params = useLocalSearchParams<{ postId?: string }>();
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const isEditing = Boolean(postId);
  const [content, setContent] = useState("");
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<PickedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadedPostId, setLoadedPostId] = useState<string | null>(null);
  const loadingPost = Boolean(postId && token && loadedPostId !== postId);

  const canPost = useMemo(
    () => content.trim().length > 0 || selectedImages.length + existingImageUrls.length > 0,
    [content, selectedImages.length, existingImageUrls.length],
  );
  const remainingImages = Math.max(0, MAX_IMAGES - selectedImages.length - existingImageUrls.length);
  const displayName = user?.displayName || user?.username || "Your profile";
  const initial = displayName.charAt(0).toUpperCase() || "Y";

  useEffect(() => {
    if (!postId || !token) return;

    let cancelled = false;
    api.get<{ success: boolean; data: { content: string; imageUrls?: string[] } }>(
      `/posts/${postId}`,
      token,
    ).then((response) => {
      if (cancelled) return;
      setContent(response.data.content ?? "");
      setExistingImageUrls(response.data.imageUrls ?? []);
    }).catch((error) => {
      if (!cancelled) {
        showAppDialog({
          title: "Couldn’t load post",
          message: error instanceof Error ? error.message : "Please try again.",
          tone: "error",
        });
      }
    }).finally(() => {
      if (!cancelled) setLoadedPostId(postId);
    });

    return () => {
      cancelled = true;
    };
  }, [postId, token]);

  const appendImages = useCallback((result: PickedAsset | PickedAsset[] | null) => {
    if (!result) return;
    const assets = Array.isArray(result) ? result : [result];
    const availableSlots = Math.max(0, MAX_IMAGES - existingImageUrls.length);
    setSelectedImages((previous) => {
      const existingUris = new Set(previous.map((asset) => asset.uri));
      const uniqueAssets = assets.filter((asset) => !existingUris.has(asset.uri));
      return [...previous, ...uniqueAssets].slice(0, availableSlots);
    });
  }, [existingImageUrls.length]);

  const handlePickFromLibrary = useCallback(async () => {
    if (remainingImages <= 0) return;
    const result = await pickFromLibrary({
      allowsMultiple: true,
      allowsEditing: false,
      mediaTypes: "images",
    });
    appendImages(result);
  }, [appendImages, remainingImages]);

  const handleTakePhoto = useCallback(async () => {
    if (remainingImages <= 0) return;
    appendImages(await takePhoto());
  }, [appendImages, remainingImages]);

  const handleRemoveImage = useCallback((uri: string) => {
    setSelectedImages((previous) => previous.filter((asset) => asset.uri !== uri));
    setExistingImageUrls((previous) => previous.filter((imageUrl) => imageUrl !== uri));
  }, []);

  const handleSavePost = useCallback(async () => {
    if (!canPost || uploading || loadingPost) return;
    if (!token) {
      showAppDialog({
        title: "Sign in required",
        message: "Please log in to create a post.",
        tone: "warning",
      });
      return;
    }

    setUploading(true);
    try {
      const uploadedImageUrls = await Promise.all(
        selectedImages.map(async (asset) => {
          const form = createUploadFormData(asset.uri, getAssetMimeType(asset));
          const response = await api.upload("/media/upload", form, token);
          return response.data.url;
        }),
      );
      const imageUrls = [...existingImageUrls, ...uploadedImageUrls];
      const payload = { content: content.trim(), imageUrls };

      if (isEditing && postId) {
        await api.patch(`/posts/${postId}`, payload, token);
      } else {
        await api.post("/posts", payload, token);
      }

      setContent("");
      setSelectedImages([]);
      setExistingImageUrls([]);
      showAppDialog({
        title: isEditing ? "Post updated" : "Post shared",
        message: isEditing
          ? "Your changes have been saved."
          : "Your moment is now part of the feed.",
        tone: "success",
        buttons: [{ key: "done", label: "Done", bold: true, onPress: () => router.back() }],
      });
    } catch (error) {
      showAppDialog({
        title: isEditing ? "Couldn’t update post" : "Couldn’t share your post",
        message: error instanceof Error ? error.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  }, [
    canPost,
    uploading,
    loadingPost,
    token,
    selectedImages,
    existingImageUrls,
    content,
    isEditing,
    postId,
  ]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.keyboardView}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close post composer"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>{isEditing ? "EDIT" : "CREATE"}</Text>
            <Text style={styles.headerTitle}>{isEditing ? "Edit post" : "New post"}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share post"
            onPress={handleSavePost}
            disabled={!canPost || uploading || loadingPost}
            style={({ pressed }) => [
              styles.shareButton,
              (!canPost || uploading || loadingPost) && styles.shareButtonDisabled,
              pressed && canPost && !uploading && !loadingPost && styles.pressed,
            ]}
          >
            {uploading || loadingPost ? (
              <ActivityIndicator size="small" color={theme.COLORS.white} />
            ) : (
              <>
                <Text style={styles.shareButtonText}>{isEditing ? "Save" : "Share"}</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.COLORS.white} />
              </>
            )}
          </Pressable>
        </View>

        {/* The controller scrolls only an obscured caret; do not wrap this in
            another keyboard avoider or enable native keyboard insets as well. */}
        <KeyboardAwareScrollView
          bottomOffset={footerHeight}
          extraKeyboardSpace={-insets.bottom}
          automaticallyAdjustKeyboardInsets={false}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode="on-drag"
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {loadingPost ? (
            <View style={styles.loadingPostState}>
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
              <Text style={styles.loadingPostText}>Loading your post…</Text>
            </View>
          ) : null}

          <View style={styles.authorCard}>
            <View style={styles.authorAvatarWrap}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.authorAvatar} />
              ) : (
                <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                  <Text style={styles.authorInitial}>{initial}</Text>
                </View>
              )}
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{displayName}</Text>
              <View style={styles.audiencePill}>
                <Ionicons name="people-outline" size={12} color={theme.COLORS.primary} />
                <Text style={styles.audienceText}>Community</Text>
              </View>
            </View>
            <View style={styles.visibilityIcon}>
              <Ionicons name="globe-outline" size={18} color={theme.COLORS.textMuted} />
            </View>
          </View>

          <TextInput
            style={styles.input}
            placeholder="What would you like to share?"
            placeholderTextColor={theme.COLORS.textMuted}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            maxLength={2000}
            accessibilityLabel="Post caption"
          />
          <Text style={styles.characterCount}>{content.length}/2000</Text>

          <View style={styles.mediaSection}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Add to your post</Text>
                <Text style={styles.sectionSubtitle}>
                  Bring your moment to life with photos
                </Text>
              </View>
              <View style={styles.mediaCountPill}>
                <Text style={styles.mediaCountText}>{existingImageUrls.length + selectedImages.length}/{MAX_IMAGES}</Text>
              </View>
            </View>

            <View style={styles.imageGrid}>
              {existingImageUrls.map((uri) => (
                <View key={`existing-${uri}`} style={styles.imageTile}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <View style={styles.imageScrim} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={() => handleRemoveImage(uri)}
                    style={({ pressed }) => [styles.removeImageButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="close" size={15} color={theme.COLORS.textPrimary} />
                  </Pressable>
                </View>
              ))}
              {selectedImages.map((asset) => (
                <View key={asset.uri} style={styles.imageTile}>
                  <Image source={{ uri: asset.uri }} style={styles.imagePreview} />
                  <View style={styles.imageScrim} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={() => handleRemoveImage(asset.uri)}
                    style={({ pressed }) => [styles.removeImageButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="close" size={15} color={theme.COLORS.textPrimary} />
                  </Pressable>
                </View>
              ))}
              {remainingImages > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handlePickFromLibrary}
                  style={({ pressed }) => [styles.addImageTile, pressed && styles.pressed]}
                >
                  <View style={styles.addImageIcon}>
                    <Ionicons name="add" size={22} color={theme.COLORS.primary} />
                  </View>
                  <Text style={styles.addImageTitle}>Add photo</Text>
                  <Text style={styles.addImageHint}>Up to {remainingImages} more</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons name="sparkles-outline" size={17} color={theme.COLORS.primary} />
            </View>
            <Text style={styles.tipText}>
              A little context makes your photos even more memorable.
            </Text>
          </View>
        </KeyboardAwareScrollView>

        {/* The outer safe area already removes the system bottom inset. Add it
            back to the keyboard translation instead of leaving a gap above IME. */}
        <KeyboardStickyView
          offset={{ closed: 0, opened: insets.bottom }}
          style={styles.footer}
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.footerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={handleTakePhoto}
              disabled={remainingImages <= 0 || uploading}
              style={({ pressed }) => [
                styles.footerAction,
                (remainingImages <= 0 || uploading) && styles.actionDisabled,
                pressed && remainingImages > 0 && styles.pressed,
              ]}
            >
              <View style={[styles.footerActionIcon, styles.cameraIcon]}>
                <Ionicons name="camera-outline" size={20} color={theme.COLORS.primary} />
              </View>
              <Text style={styles.footerActionText}>Camera</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handlePickFromLibrary}
              disabled={remainingImages <= 0 || uploading}
              style={({ pressed }) => [
                styles.footerAction,
                (remainingImages <= 0 || uploading) && styles.actionDisabled,
                pressed && remainingImages > 0 && styles.pressed,
              ]}
            >
              <View style={[styles.footerActionIcon, styles.libraryIcon]}>
                <Ionicons name="images-outline" size={20} color={theme.COLORS.accentBlue} />
              </View>
              <Text style={styles.footerActionText}>Photo library</Text>
            </Pressable>
          </View>
          <Text style={styles.footerHint}>
            {selectedImages.length + existingImageUrls.length === 0
              ? "Choose up to four photos"
              : `${selectedImages.length + existingImageUrls.length} ${selectedImages.length + existingImageUrls.length === 1 ? "photo" : "photos"} ready to ${isEditing ? "save" : "share"}`}
          </Text>
        </KeyboardStickyView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgLight,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
  },
  headerEyebrow: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
  },
  headerTitle: {
    marginTop: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  shareButton: {
    minWidth: 76,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  shareButtonDisabled: {
    opacity: 0.48,
    shadowOpacity: 0,
    elevation: 0,
  },
  shareButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.xxxxxxl,
  },
  loadingPostState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    paddingVertical: theme.SPACING.lg,
  },
  loadingPostText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  authorCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.SPACING.md,
    borderRadius: 18,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  authorAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  authorAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgInput,
  },
  authorAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  authorInitial: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  authorInfo: {
    flex: 1,
    marginLeft: theme.SPACING.md,
  },
  authorName: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  audiencePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: theme.SPACING.xs,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: 3,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  audienceText: {
    color: theme.COLORS.primary,
    fontSize: 10,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  visibilityIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgLight,
  },
  input: {
    minHeight: 150,
    marginTop: theme.SPACING.lg,
    paddingHorizontal: theme.SPACING.md,
    paddingTop: theme.SPACING.md,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl5,
    lineHeight: 28,
  },
  characterCount: {
    alignSelf: "flex-end",
    marginTop: -theme.SPACING.sm,
    marginRight: theme.SPACING.sm,
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  mediaSection: {
    marginTop: theme.SPACING.xl,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.SPACING.md,
  },
  sectionTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sectionSubtitle: {
    marginTop: theme.SPACING.xs,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  mediaCountPill: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.xs,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.borderDivider,
  },
  mediaCountText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.SPACING.sm,
  },
  imageTile: {
    position: "relative",
    width: "48%",
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: theme.COLORS.bgInput,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(26, 26, 46, 0.06)",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  addImageTile: {
    width: "48%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.COLORS.primaryGhostBorder,
    backgroundColor: theme.COLORS.bgWhite,
  },
  addImageIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  addImageTitle: {
    marginTop: theme.SPACING.sm,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  addImageHint: {
    marginTop: 2,
    color: theme.COLORS.textMuted,
    fontSize: 9,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.xl,
    padding: theme.SPACING.md,
    borderRadius: 16,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgWhite,
  },
  tipText: {
    flex: 1,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: theme.TYPOGRAPHY.lineHeight.md,
  },
  footer: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  footerActions: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
  },
  footerAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    borderRadius: 15,
    backgroundColor: theme.COLORS.bgLight,
  },
  footerActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraIcon: {
    backgroundColor: theme.COLORS.primaryGhost,
  },
  libraryIcon: {
    backgroundColor: "rgba(59, 130, 246, 0.10)",
  },
  footerActionText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  footerHint: {
    marginTop: theme.SPACING.sm,
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    textAlign: "center",
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
});
