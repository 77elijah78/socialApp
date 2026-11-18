import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

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

const MAX_MEDIA = 4;

type MediaItem = {
  key: string;
  uri: string;
  type: "image" | "video";
  kind: "existing" | "new";
  asset?: PickedAsset;
};

function isVideoAsset(asset: PickedAsset): boolean {
  return (
    asset.type === "video" || Boolean(asset.mimeType?.startsWith("video/"))
  );
}

function toMediaItem(asset: PickedAsset): MediaItem {
  return {
    key: `new:${asset.uri}`,
    uri: asset.uri,
    type: isVideoAsset(asset) ? "video" : "image",
    kind: "new",
    asset,
  };
}

export default function CreatePostScreen() {
  const token = useAppSelector((state) => state.auth.token);
  const user = useAppSelector((state) => state.auth.user);
  const params = useLocalSearchParams<{ postId?: string }>();
  const postId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const isEditing = Boolean(postId);
  const { width } = useWindowDimensions();
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [loadedPostId, setLoadedPostId] = useState<string | null>(null);
  const submitting = useRef(false);
  const loadingPost = Boolean(postId && token && loadedPostId !== postId);

  const previewSize = useMemo(() => {
    const available = width - theme.LAYOUT.contentPadding * 2 - 32;
    return Math.max(72, Math.min(112, Math.floor((available - 16) / 3)));
  }, [width]);

  const canPublish = useMemo(
    () => content.trim().length > 0 || media.length > 0,
    [content, media.length],
  );
  const remaining = Math.max(0, MAX_MEDIA - media.length);
  const displayName = user?.displayName || user?.username || "Your profile";
  const initial = displayName.charAt(0).toUpperCase() || "Y";
  const busy = uploading || loadingPost;

  useEffect(() => {
    if (!postId || !token) return;
    let cancelled = false;
    api
      .get<{
        success: boolean;
        data: { content: string; imageUrls?: string[]; videoUrl?: string | null };
      }>(`/posts/${postId}`, token)
      .then((response) => {
        if (cancelled) return;
        setContent(response.data.content ?? "");
        const existing: MediaItem[] = (response.data.imageUrls ?? []).map(
          (uri) => ({
            key: `existing:${uri}`,
            uri,
            type: "image",
            kind: "existing",
          }),
        );
        if (response.data.videoUrl) {
          existing.unshift({
            key: `existing-video:${response.data.videoUrl}`,
            uri: response.data.videoUrl,
            type: "video",
            kind: "existing",
          });
        }
        setMedia(existing);
      })
      .catch((error) => {
        if (!cancelled) {
          showAppDialog({
            title: "Couldn’t load post",
            message:
              error instanceof Error ? error.message : "Please try again.",
            tone: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadedPostId(postId);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, token]);

  const appendAssets = useCallback(
    (result: PickedAsset | PickedAsset[] | null) => {
      if (!result) return;
      const assets = (Array.isArray(result) ? result : [result]).filter(
        (asset) => Boolean(asset?.uri),
      );
      if (!assets.length) return;
      const video = assets.find(isVideoAsset);
      setMedia((previous) => {
        // The backend accepts one video per post; mixing a video with a gallery
        // would make the preview and payload ambiguous.
        if (video) return [toMediaItem(video)];
        const withoutVideo = previous.filter((item) => item.type !== "video");
        const next = [...withoutVideo];
        const seen = new Set(next.map((item) => item.uri));
        for (const asset of assets) {
          if (next.length >= MAX_MEDIA) break;
          if (isVideoAsset(asset) || seen.has(asset.uri)) continue;
          seen.add(asset.uri);
          next.push(toMediaItem(asset));
        }
        return next;
      });
    },
    [],
  );

  const handlePickFromLibrary = useCallback(async () => {
    if (remaining <= 0 || busy) return;
    const result = await pickFromLibrary({
      allowsMultiple: true,
      allowsEditing: false,
      mediaTypes: "all",
    });
    appendAssets(result);
  }, [appendAssets, busy, remaining]);

  const handleTakePhoto = useCallback(async () => {
    if (remaining <= 0 || busy) return;
    appendAssets(await takePhoto());
  }, [appendAssets, busy, remaining]);

  const handleRemove = useCallback((key: string) => {
    setMedia((previous) => previous.filter((item) => item.key !== key));
  }, []);

  const moveMedia = useCallback((index: number, delta: -1 | 1) => {
    setMedia((previous) => {
      const target = index + delta;
      if (index < 0 || target < 0 || target >= previous.length)
        return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const addHashtag = useCallback(() => {
    setContent((previous) => {
      const trimmedEnd = previous.replace(/\s+$/, "");
      return `${trimmedEnd}${trimmedEnd ? " " : ""}#`;
    });
  }, []);

  const handlePublish = useCallback(async () => {
    if (!canPublish || submitting.current || busy) return;
    if (!token) {
      showAppDialog({
        title: "Sign in required",
        message: "Please log in to create a post.",
        tone: "warning",
      });
      return;
    }
    submitting.current = true;
    setUploading(true);
    setPublishError(null);
    setProgress(0);
    const pendingUploads = media.filter((item) => item.kind === "new");
    const totalUploads = Math.max(1, pendingUploads.length);
    let completedUploads = 0;
    try {
      const resolved: { uri: string; type: "image" | "video" }[] = [];
      for (const item of media) {
        if (item.kind === "existing") {
          resolved.push({ uri: item.uri, type: item.type });
          continue;
        }
        setPhase(
          `Uploading ${Math.min(completedUploads + 1, totalUploads)} of ${totalUploads}`,
        );
        const mimeType = item.asset
          ? getAssetMimeType(item.asset)
          : item.type === "video"
            ? "video/mp4"
            : "image/jpeg";
        const form = createUploadFormData(item.uri, mimeType);
        const response = await api.upload(
          "/media/upload",
          form,
          token,
          (percent) => {
            const scaled =
              ((completedUploads +
                Math.max(0, Math.min(100, percent)) / 100) /
                totalUploads) *
              92;
            setProgress((value) => Math.max(value, Math.round(scaled)));
          },
        );
        resolved.push({ uri: response.data.url, type: item.type });
        completedUploads += 1;
        setProgress(Math.round((completedUploads / totalUploads) * 92));
      }

      const imageUrls = resolved
        .filter((item) => item.type === "image")
        .map((item) => item.uri);
      const video = resolved.find((item) => item.type === "video");
      const payload: {
        content: string;
        imageUrls: string[];
        videoUrl?: string;
      } = { content: content.trim(), imageUrls };
      // Omit the key entirely when there is no video so the existing create/
      // edit contract is unchanged for image-only posts.
      if (video) payload.videoUrl = video.uri;

      setPhase(isEditing ? "Saving changes" : "Publishing");
      setProgress(96);
      if (isEditing && postId) {
        await api.patch(`/posts/${postId}`, payload, token);
      } else {
        await api.post("/posts", payload, token);
      }
      setProgress(100);
      setContent("");
      setMedia([]);
      showAppDialog({
        title: isEditing ? "Post updated" : "Post shared",
        message: isEditing
          ? "Your changes have been saved."
          : "Your moment is now part of the feed.",
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Please try again.";
      setPublishError(message);
      showAppDialog({
        title: isEditing ? "Couldn’t update post" : "Couldn’t share your post",
        message,
        tone: "error",
      });
    } finally {
      submitting.current = false;
      setUploading(false);
      setPhase("");
    }
  }, [
    busy,
    canPublish,
    content,
    isEditing,
    media,
    postId,
    token,
  ]);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close post composer"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.closeButton,
              busy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="close" size={22} color={theme.COLORS.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>
              {isEditing ? "EDIT" : "CREATE"}
            </Text>
            <Text style={styles.headerTitle}>
              {isEditing ? "Edit post" : "New post"}
            </Text>
          </View>
          <View style={styles.mediaCounter}>
            <Text style={styles.mediaCounterText}>
              {media.length}/{MAX_MEDIA}
            </Text>
          </View>
        </View>

        <ScrollView
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
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.authorAvatar}
                />
              ) : (
                <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                  <Text style={styles.authorInitial}>{initial}</Text>
                </View>
              )}
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{displayName}</Text>
              <Text style={styles.authorHint}>
                {isEditing
                  ? "Update your caption or media"
                  : "Share a moment with your community"}
              </Text>
            </View>
          </View>

          <View style={styles.captionCard}>
            <TextInput
              style={styles.input}
              placeholder="Write a caption…"
              placeholderTextColor={theme.COLORS.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              accessibilityLabel="Post caption"
            />
            <View style={styles.captionMeta}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add hashtag"
                onPress={addHashtag}
                style={({ pressed }) => [
                  styles.hashtagButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.hashtagText}># Add hashtag</Text>
              </Pressable>
              <Text style={styles.characterCount}>
                {content.length}/2000
              </Text>
            </View>
          </View>

          <View style={styles.sectionHeading}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionTitle}>Media</Text>
              <Text style={styles.sectionSubtitle}>
                Up to four photos, or one video.
              </Text>
            </View>
            {media.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add more media"
                disabled={remaining <= 0 || busy}
                onPress={() => void handlePickFromLibrary()}
                style={({ pressed }) => [
                  styles.addMore,
                  (remaining <= 0 || busy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="add"
                  size={16}
                  color={theme.COLORS.primary}
                />
                <Text style={styles.addMoreText}>Add</Text>
              </Pressable>
            ) : null}
          </View>

          {media.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photos or video"
              disabled={busy}
              onPress={() => void handlePickFromLibrary()}
              style={({ pressed }) => [
                styles.emptyMedia,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              <View style={styles.emptyMediaIcon}>
                <Ionicons
                  name="images-outline"
                  size={26}
                  color={theme.COLORS.primary}
                />
              </View>
              <Text style={styles.emptyMediaTitle}>
                Add photos or a video
              </Text>
              <Text style={styles.emptyMediaHint}>
                Your gallery, or take a new photo
              </Text>
              <View style={styles.emptyMediaActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose from library"
                  disabled={busy}
                  onPress={(event) => {
                    event.stopPropagation();
                    void handlePickFromLibrary();
                  }}
                  style={({ pressed }) => [
                    styles.emptyMediaAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="images-outline"
                    size={15}
                    color={theme.COLORS.primary}
                  />
                  <Text style={styles.emptyMediaActionText}>Library</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Take a photo"
                  disabled={busy}
                  onPress={(event) => {
                    event.stopPropagation();
                    void handleTakePhoto();
                  }}
                  style={({ pressed }) => [
                    styles.emptyMediaAction,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="camera-outline"
                    size={15}
                    color={theme.COLORS.accentBlue}
                  />
                  <Text style={styles.emptyMediaActionText}>Camera</Text>
                </Pressable>
              </View>
            </Pressable>
          ) : (
            <View style={styles.mediaGrid}>
              {media.map((item, index) => (
                <View
                  key={item.key}
                  style={[
                    styles.mediaTile,
                    { width: previewSize, height: previewSize },
                  ]}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.mediaPreview}
                    resizeMode="cover"
                  />
                  {item.type === "video" ? (
                    <View style={styles.videoOverlay}>
                      <Ionicons
                        name="play"
                        size={18}
                        color={theme.COLORS.white}
                      />
                    </View>
                  ) : null}
                  <View style={styles.tileIndex}>
                    <Text style={styles.tileIndexText}>{index + 1}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove media"
                    disabled={busy}
                    onPress={() => handleRemove(item.key)}
                    style={({ pressed }) => [
                      styles.removeButton,
                      busy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name="close"
                      size={13}
                      color={theme.COLORS.textPrimary}
                    />
                  </Pressable>
                  <View style={styles.reorderRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Move media earlier"
                      accessibilityState={{ disabled: index === 0 || busy }}
                      disabled={index === 0 || busy}
                      onPress={() => moveMedia(index, -1)}
                      style={({ pressed }) => [
                        styles.reorderButton,
                        index === 0 && styles.reorderDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={13}
                        color={theme.COLORS.white}
                      />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Move media later"
                      accessibilityState={{
                        disabled: index === media.length - 1 || busy,
                      }}
                      disabled={index === media.length - 1 || busy}
                      onPress={() => moveMedia(index, 1)}
                      style={({ pressed }) => [
                        styles.reorderButton,
                        index === media.length - 1 && styles.reorderDisabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={13}
                        color={theme.COLORS.white}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}
              {remaining > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add more media"
                  disabled={busy}
                  onPress={() => void handlePickFromLibrary()}
                  style={({ pressed }) => [
                    styles.addTile,
                    { width: previewSize, height: previewSize },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color={theme.COLORS.primary}
                  />
                  <Text style={styles.addTileText}>Add</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {uploading ? (
            <View
              style={styles.progressCard}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={phase || "Publishing post"}
              accessibilityValue={{ min: 0, max: 100, now: progress }}
            >
              <View style={styles.progressHeader}>
                <ActivityIndicator
                  size="small"
                  color={theme.COLORS.primary}
                />
                <Text style={styles.progressLabel}>
                  {phase || "Publishing…"}
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

          {publishError ? (
            <Pressable
              accessibilityRole="alert"
              onPress={() => setPublishError(null)}
              style={styles.errorCard}
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={theme.COLORS.danger}
              />
              <Text style={styles.errorText}>{publishError}</Text>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              onPress={handleTakePhoto}
              disabled={remaining <= 0 || busy}
              style={({ pressed }) => [
                styles.footerAction,
                (remaining <= 0 || busy) && styles.disabled,
                pressed && remaining > 0 && styles.pressed,
              ]}
            >
              <Ionicons
                name="camera-outline"
                size={19}
                color={theme.COLORS.primary}
              />
              <Text style={styles.footerActionText}>Camera</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose from photo library"
              onPress={handlePickFromLibrary}
              disabled={remaining <= 0 || busy}
              style={({ pressed }) => [
                styles.footerAction,
                (remaining <= 0 || busy) && styles.disabled,
                pressed && remaining > 0 && styles.pressed,
              ]}
            >
              <Ionicons
                name="images-outline"
                size={19}
                color={theme.COLORS.accentBlue}
              />
              <Text style={styles.footerActionText}>Photo library</Text>
            </Pressable>
            <Text numberOfLines={1} style={styles.footerHint}>
              {media.length === 0
                ? "Add media or just text"
                : `${media.length} ${media.length === 1 ? "item" : "items"} ready`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share post"
            accessibilityState={{ disabled: !canPublish || busy, busy }}
            onPress={() => void handlePublish()}
            disabled={!canPublish || busy}
            style={({ pressed }) => [
              styles.publishButton,
              (!canPublish || busy) && styles.publishDisabled,
              pressed && canPublish && !busy && styles.pressed,
            ]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={theme.COLORS.white} />
            ) : (
              <>
                <Ionicons
                  name={isEditing ? "checkmark" : "paper-plane"}
                  size={17}
                  color={theme.COLORS.white}
                />
                <Text style={styles.publishText}>
                  {isEditing ? "Save changes" : "Share post"}
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
  safeArea: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  keyboardView: {
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
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    color: theme.COLORS.primary,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 1,
  },
  headerTitle: {
    marginTop: 1,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl6,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  mediaCounter: {
    minWidth: 44,
    height: 30,
    paddingHorizontal: theme.SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  mediaCounterText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: theme.LAYOUT.contentPadding,
    paddingTop: theme.SPACING.lg,
    paddingBottom: theme.SPACING.xxl,
    gap: theme.SPACING.md,
  },
  loadingPostState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    paddingVertical: theme.SPACING.sm,
  },
  loadingPostText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  authorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    padding: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  authorAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  authorInfo: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  authorHint: {
    marginTop: 2,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  captionCard: {
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    padding: theme.SPACING.md,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.cardBorder,
  },
  input: {
    minHeight: 96,
    paddingHorizontal: theme.SPACING.sm,
    paddingTop: theme.SPACING.sm,
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl,
    lineHeight: theme.TYPOGRAPHY.lineHeight.xxl,
  },
  captionMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.SPACING.sm,
  },
  hashtagButton: {
    minHeight: 32,
    paddingHorizontal: theme.SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.primaryGhost,
  },
  hashtagText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  characterCount: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.sm,
  },
  sectionHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  sectionSubtitle: {
    marginTop: 1,
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
  },
  addMore: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: theme.COLORS.primaryGhostBorder,
  },
  addMoreText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.SPACING.xxxl,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.xxxxxl,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: theme.COLORS.primaryGhostBorder,
    backgroundColor: theme.COLORS.bgWhite,
    gap: theme.SPACING.xs,
  },
  emptyMediaIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
    marginBottom: theme.SPACING.xs,
  },
  emptyMediaTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  emptyMediaHint: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    textAlign: "center",
  },
  emptyMediaActions: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
  },
  emptyMediaAction: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: theme.SPACING.lg,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgLight,
  },
  emptyMediaActionText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.SPACING.md,
  },
  mediaTile: {
    borderRadius: theme.BORDER_RADIUS.xxxl,
    overflow: "hidden",
    backgroundColor: theme.COLORS.bgInput,
  },
  mediaPreview: {
    width: "100%",
    height: "100%",
  },
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  tileIndex: {
    position: "absolute",
    top: 5,
    left: 5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  tileIndexText: {
    color: theme.COLORS.white,
    fontSize: 9,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  reorderRow: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reorderButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  reorderDisabled: {
    opacity: 0.28,
  },
  addTile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: theme.BORDER_RADIUS.xxxl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.COLORS.primaryGhostBorder,
    backgroundColor: theme.COLORS.bgWhite,
  },
  addTileText: {
    color: theme.COLORS.primary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  progressCard: {
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
    gap: theme.SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
  },
  footerAction: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: theme.SPACING.md,
    borderRadius: theme.BORDER_RADIUS.full,
    backgroundColor: theme.COLORS.bgLight,
  },
  footerActionText: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  footerHint: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
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
  publishDisabled: {
    opacity: theme.OPACITY.disabled,
    shadowOpacity: 0,
    elevation: 0,
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
