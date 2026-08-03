import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import theme from "@/constants/theme";
import {
  pickFromLibrary,
  takePhoto,
  createUploadFormData,
  getAssetMimeType,
  PickedAsset,
} from "@/hooks/useImagePicker";

export default function CreatePostScreen() {
  const token = useAppSelector((s) => s.auth.token);
  const [content, setContent] = useState("");
  const [selectedImages, setSelectedImages] = useState<PickedAsset[]>([]);
  const [uploading, setUploading] = useState(false);

  const handlePickFromLibrary = async () => {
    const result = await pickFromLibrary({
      allowsMultiple: true,
      allowsEditing: false,
      mediaTypes: selectedImages.length > 0 ? undefined : "images",
    });
    if (result) {
      const assets = Array.isArray(result) ? result : [result];
      setSelectedImages((prev) => [...prev, ...assets].slice(0, 4));
    }
  };

  const handleTakePhoto = async () => {
    const asset = await takePhoto();
    if (asset) {
      setSelectedImages((prev) => [...prev, asset].slice(0, 4));
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreatePost = async () => {
    if (!content.trim() && selectedImages.length === 0) {
      Alert.alert("Empty Post", "Please add some content or images.");
      return;
    }
    if (!token) {
      Alert.alert("Not Authenticated", "Please log in to create a post.");
      return;
    }

    setUploading(true);
    try {
      let imageUrls: string[] = [];

      if (selectedImages.length > 0) {
        for (const asset of selectedImages) {
          const mimeType = getAssetMimeType(asset);
          const form = createUploadFormData(asset.uri, mimeType);
          const resp = await api.upload("/media/upload", form, token);
          imageUrls.push(resp.data.url);
        }
      }

      await api.post<{
        success: boolean;
        data: unknown;
      }>(
        "/posts",
        {
          content: content.trim(),
          imageUrls,
        },
        token,
      );

      setContent("");
      setSelectedImages([]);
      Alert.alert("Success", "Post created!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert("Failed", (err as Error).message || "Could not create post.");
    } finally {
      setUploading(false);
    }
  };

  const canPost = content.trim().length > 0 || selectedImages.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Post</Text>
        <TouchableOpacity
          style={[styles.postBtn, !canPost || uploading ? styles.postBtnDisabled : null]}
          onPress={handleCreatePost}
          disabled={!canPost || uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={theme.COLORS.white} />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <TextInput
          style={styles.input}
          placeholder="What's on your mind?"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        <View style={styles.imageGrid}>
          {selectedImages.map((img, idx) => (
            <View key={idx} style={styles.imageWrapper}>
              <Image source={{ uri: img.uri }} style={styles.image} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemoveImage(idx)}
              >
                <Ionicons name="close-circle" size={20} color={theme.COLORS.primary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleTakePhoto}
            disabled={selectedImages.length >= 4}
          >
            <Ionicons name="camera" size={24} color={theme.COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handlePickFromLibrary}
            disabled={selectedImages.length >= 4}
          >
            <Ionicons name="image" size={24} color={theme.COLORS.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          {selectedImages.length}/4 images selected
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
    backgroundColor: theme.COLORS.bgWhite,
  },
  headerTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
    color: theme.COLORS.textPrimary,
  },
  postBtn: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.primary,
    borderRadius: theme.BORDER_RADIUS.md,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    color: theme.COLORS.white,
    fontWeight: "600",
  },
  body: {
    flex: 1,
    padding: theme.SPACING.md,
  },
  input: {
    width: "100%",
    minHeight: 120,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textPrimary,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: theme.BORDER_RADIUS.md,
    padding: theme.SPACING.md,
    textAlignVertical: "top",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.SPACING.sm,
    marginTop: theme.SPACING.md,
  },
  imageWrapper: {
    position: "relative",
    width: 100,
    height: 100,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: theme.BORDER_RADIUS.sm,
    resizeMode: "cover",
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: theme.COLORS.bgWhite,
    borderRadius: 10,
  },
  footer: {
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgWhite,
    borderTopWidth: 1,
    borderTopColor: theme.COLORS.borderDivider,
  },
  actionsRow: {
    flexDirection: "row",
    gap: theme.SPACING.sm,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.COLORS.bgLight,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    marginTop: theme.SPACING.sm,
    fontSize: theme.TYPOGRAPHY.fontSize.xs,
    color: theme.COLORS.textMuted,
  },
});
