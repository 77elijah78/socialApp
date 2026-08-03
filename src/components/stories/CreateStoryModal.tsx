import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/services/api";
import { useAppSelector } from "@/store/hooks";
import theme from "@/constants/theme";
import {
  pickFromLibrary,
  takePhoto,
  showImageSourceActionSheet,
  createUploadFormData,
  getAssetMimeType,
  getAssetFilename,
  PickedAsset,
} from "@/hooks/useImagePicker";

interface CreateStoryModalProps {
  visible: boolean;
  onClose: () => void;
  onStoryCreated: () => void;
}

export default function CreateStoryModal({
  visible,
  onClose,
  onStoryCreated,
}: CreateStoryModalProps) {
  const token = useAppSelector((s) => s.auth.token);
  const [step, setStep] = useState<"select" | "edit">("select");
  const [selectedImage, setSelectedImage] = useState<PickedAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setStep("select");
    setSelectedImage(null);
    setCaption("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSelectSource = () => {
    showImageSourceActionSheet(async (action) => {
      let asset: PickedAsset | null = null;
      if (action === "library") {
        asset = (await pickFromLibrary({ allowsEditing: true, aspect: [9, 16] })) as PickedAsset | null;
      } else {
        asset = await takePhoto();
      }
      if (asset) {
        setSelectedImage(asset);
        setStep("edit");
      }
    });
  };

  const handleUpload = async () => {
    if (!selectedImage || !token || uploading) return;

    setUploading(true);
    try {
      const mimeType = getAssetMimeType(selectedImage);
      const filename = getAssetFilename(selectedImage, "story");
      const form = createUploadFormData(selectedImage.uri, mimeType);
      const resp = await api.upload("/media/upload", form, token);

      const mediaUrl = resp.data.url;

      await api.post<{
        success: boolean;
        data: unknown;
      }>(
        "/posts/stories",
        {
          mediaUrl,
          mediaType: "image",
          caption: caption.trim() || undefined,
        },
        token,
      );

      onStoryCreated();
      handleClose();
    } catch (err) {
      Alert.alert("Upload Failed", (err as Error).message || "Could not create story.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={theme.COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Story</Text>
            <TouchableOpacity
              onPress={handleUpload}
              disabled={!selectedImage || !token || uploading}
              style={[
                styles.actionBtn,
                !selectedImage && styles.actionBtnDisabled,
              ]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={theme.COLORS.white} />
              ) : (
                <Ionicons name="paper-plane" size={20} color={theme.COLORS.white} />
              )}
            </TouchableOpacity>
          </View>

          {step === "select" && (
            <View style={styles.content}>
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={handleSelectSource}
              >
                <Ionicons name="image" size={28} color={theme.COLORS.primary} />
                <Text style={styles.actionSheetText}>Select from Library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={async () => {
                  const asset = await takePhoto();
                  if (asset) {
                    setSelectedImage(asset);
                    setStep("edit");
                  }
                }}
              >
                <Ionicons name="camera" size={28} color={theme.COLORS.primary} />
                <Text style={styles.actionSheetText}>Take Photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "edit" && selectedImage && (
            <View style={styles.editContent}>
              <Image source={{ uri: selectedImage.uri }} style={styles.preview} />
              <TextInput
                style={styles.captionInput}
                placeholder="Write a caption..."
                value={caption}
                onChangeText={setCaption}
                placeholderTextColor={theme.COLORS.textMuted}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: theme.COLORS.bgWhite,
    borderTopLeftRadius: theme.BORDER_RADIUS.lg,
    borderTopRightRadius: theme.BORDER_RADIUS.lg,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.borderDivider,
  },
  modalTitle: {
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: "600",
    color: theme.COLORS.textPrimary,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  content: {
    padding: theme.SPACING.md,
    gap: theme.SPACING.sm,
  },
  actionSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.SPACING.md,
    paddingVertical: theme.SPACING.md,
  },
  actionSheetText: {
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    color: theme.COLORS.textPrimary,
  },
  editContent: {
    padding: theme.SPACING.md,
    alignItems: "center",
  },
  preview: {
    width: 200,
    height: 360,
    borderRadius: theme.BORDER_RADIUS.md,
    resizeMode: "cover",
  },
  captionInput: {
    marginTop: theme.SPACING.md,
    width: "100%",
    paddingHorizontal: theme.SPACING.md,
    paddingVertical: theme.SPACING.sm,
    backgroundColor: theme.COLORS.bgLight,
    borderRadius: theme.BORDER_RADIUS.md,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    color: theme.COLORS.textPrimary,
  },
});
