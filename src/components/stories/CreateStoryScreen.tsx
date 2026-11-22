import React, { useCallback, useRef, useState } from "react";
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
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import theme from "@/constants/theme";
import {
  captureMedia,
  createUploadFormData,
  getAssetMimeType,
  PickedAsset,
  pickFromLibrary,
} from "@/hooks/useImagePicker";
import { api } from "@/services/api";
import { showAppDialog } from "@/services/AppDialogService";
import { useAppSelector } from "@/store/hooks";
import { publishStoryCreated } from "@/utils/storyUpdates";

function StoryVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.previewMedia}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

function isVideo(asset: PickedAsset): boolean {
  return (
    asset.type === "video" || Boolean(asset.mimeType?.startsWith("video/"))
  );
}

/** Lightweight story creator: one media item, a caption, real upload progress
 * and the existing `POST /posts/stories` contract. The current app has no
 * text/sticker/drawing editor, so none is fabricated here. */
export default function CreateStoryScreen() {
  const token = useAppSelector((state) => state.auth.token);
  const { width, height } = useWindowDimensions();
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const submitting = useRef(false);
  const publishDisabled = !asset || uploading || published;

  const previewWidth = Math.max(
    160,
    Math.min(width - theme.LAYOUT.contentPadding * 2, 340),
  );
  const previewHeight = Math.min((previewWidth * 16) / 9, height * 0.55);

  const pick = useCallback(async (source: "library" | "camera") => {
    if (submitting.current) return;
    setError(null);
    const selected =
      source === "library"
        ? await pickFromLibrary({
            mediaTypes: "all",
            allowsMultiple: false,
            allowsEditing: false,
          })
        : await captureMedia();
    if (!selected) return;
    setAsset(Array.isArray(selected) ? selected[0] ?? null : selected);
  }, []);

  const handlePublish = useCallback(async () => {
    if (!asset || !token || submitting.current || published) return;
    submitting.current = true;
    setUploading(true);
    setError(null);
    setProgress(0);
    setPhase("Uploading story");
    try {
      const mimeType = getAssetMimeType(asset);
      const form = createUploadFormData(asset.uri, mimeType);
      const uploaded = await api.upload(
        "/media/upload",
        form,
        token,
        (percent) =>
          setProgress((value) =>
            Math.max(value, Math.min(90, Math.round(percent * 0.9))),
          ),
      );
      setPhase("Sharing story");
      setProgress(94);
      await api.post(
        "/posts/stories",
        {
          mediaUrl: uploaded.data.url,
          mediaType: isVideo(asset) ? "video" : "image",
          caption: caption.trim() || undefined,
        },
        token,
      );
      setProgress(100);
      setPublished(true);
      publishStoryCreated();
      showAppDialog({
        title: "Story shared",
        message: "Your story is live for the next 24 hours.",
        tone: "success",
        buttons: [
          {
            key: "done",
            label: "Done",
            bold: true,
            onPress: () => router.back(),
          },
        ],
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Please try again.";
      setError(message);
      showAppDialog({
        title: "Couldn’t share your story",
        message,
        tone: "error",
      });
    } finally {
      submitting.current = false;
      setUploading(false);
      setPhase("");
    }
  }, [asset, caption, published, token]);

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close story creator"
            accessibilityState={{ disabled: uploading }}
            disabled={uploading}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.closeButton,
              uploading && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="close" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>24 HOURS</Text>
            <Text style={styles.title}>New story</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Publish story"
            accessibilityState={{
              disabled: publishDisabled,
              busy: uploading,
            }}
            disabled={publishDisabled}
            onPress={() => void handlePublish()}
            style={({ pressed }) => [
              styles.headerPublish,
              publishDisabled && styles.disabled,
              pressed && !publishDisabled && styles.pressed,
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={theme.COLORS.white} />
            ) : (
              <Text style={styles.headerPublishText}>Share</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={false}
        >
          <View
            style={[
              styles.preview,
              { width: previewWidth, height: previewHeight },
            ]}
          >
            {asset ? (
              isVideo(asset) ? (
                <StoryVideoPreview uri={asset.uri} />
              ) : (
                <Image
                  source={{ uri: asset.uri }}
                  style={styles.previewMedia}
                  resizeMode="cover"
                />
              )
            ) : (
              <View style={styles.emptyPreview}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="sparkles-outline"
                    size={26}
                    color={theme.COLORS.primary}
                  />
                </View>
                <Text style={styles.emptyTitle}>Start with a moment</Text>
                <Text style={styles.emptyHint}>
                  A photo or a short video, straight from your day.
                </Text>
                <View style={styles.emptyActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose from library"
                    onPress={() => void pick("library")}
                    style={({ pressed }) => [
                      styles.chooseButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="images-outline"
                      size={16}
                      color={theme.COLORS.primary}
                    />
                    <Text style={styles.chooseText}>Library</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open camera"
                    onPress={() => void pick("camera")}
                    style={({ pressed }) => [
                      styles.chooseButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="camera-outline"
                      size={16}
                      color={theme.COLORS.primary}
                    />
                    <Text style={styles.chooseText}>Camera</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {asset ? (
              <View style={styles.previewBadge}>
                <Ionicons
                  name={isVideo(asset) ? "videocam" : "image"}
                  size={11}
                  color={theme.COLORS.white}
                />
                <Text style={styles.previewBadgeText}>
                  {isVideo(asset) ? "Video story" : "Photo story"}
                </Text>
              </View>
            ) : null}
          </View>

          {asset ? (
            <View style={styles.replaceRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Replace story media"
                disabled={uploading || published}
                onPress={() => void pick("library")}
                style={({ pressed }) => [
                  styles.replaceButton,
                  (uploading || published) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={15}
                  color={theme.COLORS.primary}
                />
                <Text style={styles.replaceText}>Replace</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove story media"
                disabled={uploading || published}
                onPress={() => {
                  setAsset(null);
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.replaceButton,
                  styles.removeButton,
                  (uploading || published) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="trash-outline"
                  size={15}
                  color={theme.COLORS.danger}
                />
                <Text style={[styles.replaceText, styles.removeText]}>
                  Remove
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.captionCard}>
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption (optional)"
              placeholderTextColor={theme.COLORS.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={280}
              textAlignVertical="top"
              accessibilityLabel="Story caption"
              editable={!uploading}
            />
            <Text style={styles.captionCount}>{caption.length}/280</Text>
          </View>

          {uploading ? (
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={phase || "Sharing story"}
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={styles.progressCard}
            >
              <View style={styles.progressHeader}>
                <ActivityIndicator
                  size="small"
                  color={theme.COLORS.primary}
                />
                <Text style={styles.progressLabel}>
                  {phase || "Sharing story…"}
                </Text>
                <Text style={styles.progressPercent}>{progress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
            </View>
          ) : null}

          {error ? (
            <Pressable
              accessibilityRole="alert"
              onPress={() => setError(null)}
              style={styles.errorCard}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.COLORS.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Publish story"
            accessibilityState={{
              disabled: publishDisabled,
              busy: uploading,
            }}
            disabled={publishDisabled}
            onPress={() => void handlePublish()}
            style={({ pressed }) => [
              styles.publishButton,
              publishDisabled && styles.disabled,
              pressed && !publishDisabled && styles.pressed,
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={theme.COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name={published ? "checkmark-circle" : "arrow-up-circle"}
                  size={18}
                  color={theme.COLORS.white}
                />
                <Text style={styles.publishText}>
                  {published ? "Story shared" : "Share story"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  flex: {
    flex: 1,
  },
  header: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.LAYOUT.contentPadding,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgLight,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.COLORS.primary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
  },
  title: {
    marginTop: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  headerPublish: {
    minWidth: 66,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primary,
  },
  headerPublishText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.xl,
    gap: theme.SPACING.md,
  },
  preview: {
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
    overflow: "hidden",
    backgroundColor: "#14131E",
  },
  previewMedia: {
    width: "100%",
    height: "100%",
  },
  emptyPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.SPACING.xl,
    gap: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.COLORS.primaryGhostBorder,
    borderRadius: theme.BORDER_RADIUS.xxxxxxl,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    marginBottom: theme.SPACING.xs,
  },
  emptyTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    textAlign: "center",
  },
  emptyHint: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: 17,
    textAlign: "center",
  },
  emptyActions: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
  },
  chooseButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgLight,
  },
  chooseText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  previewBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.SPACING.sm,
    paddingVertical: 4,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  previewBadgeText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  replaceRow: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
    width: "100%",
    justifyContent: "center",
  },
  replaceButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  removeButton: {
    borderColor: "rgba(255,71,87,0.18)",
    backgroundColor: theme.COLORS.dangerLight,
  },
  replaceText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  removeText: {
    color: theme.COLORS.danger,
  },
  captionCard: {
    width: "100%",
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    padding: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  captionInput: {
    minHeight: 54,
    paddingHorizontal: theme.SPACING.sm,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xxl,
  },
  captionCount: {
    alignSelf: "flex-end",
    paddingRight: theme.SPACING.sm,
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  progressCard: {
    width: "100%",
    padding: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.xxxl,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
    gap: theme.SPACING.sm,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
  },
  progressLabel: {
    flex: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  progressPercent: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.COLORS.bgInput,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: theme.COLORS.primary,
  },
  errorCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.sm,
    padding: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.md,
    backgroundColor: theme.COLORS.dangerLight,
  },
  errorText: {
    flex: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    lineHeight: 16,
  },
  errorDismiss: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  footer: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.sm,
    paddingBottom: theme.SPACING.md,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  publishButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  publishText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  disabled: {
    opacity: theme.OPACITY.disabled,
  },
  pressed: {
    opacity: theme.OPACITY.pressed,
  },
});
