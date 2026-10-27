import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "@/constants/theme";
import { showAppDialog } from "@/services/AppDialogService";
import { PickedFile } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (files: PickedFile[]) => void;
}

interface SelectableFile extends PickedFile {
  selected: boolean;
}

const SOURCE_OPTIONS = [
  { key: "camera", icon: "camera-outline", label: "Camera", caption: "Take a photo" },
  { key: "image", icon: "image-outline", label: "Photos", caption: "Choose images" },
  { key: "video", icon: "videocam-outline", label: "Video", caption: "Choose a clip" },
  { key: "audio", icon: "musical-notes-outline", label: "Audio", caption: "Send a track" },
  { key: "file", icon: "document-outline", label: "File", caption: "Browse files" },
] as const;

export default function MediaPickerModal({ visible, onClose, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const [pickedFiles, setPickedFiles] = useState<SelectableFile[]>([]);
  const [openingSource, setOpeningSource] = useState(false);

  const addFiles = (files: PickedFile[]) => {
    setPickedFiles((previous) => {
      const existing = new Set(previous.map((file) => file.uri));
      const next = files
        .filter((file) => !existing.has(file.uri))
        .map((file) => ({ ...file, selected: true }));
      return [...previous, ...next];
    });
  };

  const toggleSelect = (uri: string) => {
    setPickedFiles((previous) =>
      previous.map((file) =>
        file.uri === uri ? { ...file, selected: !file.selected } : file,
      ),
    );
  };

  const removeFile = (uri: string) => {
    setPickedFiles((previous) => previous.filter((file) => file.uri !== uri));
  };

  const clearAll = () => setPickedFiles([]);

  const handleSend = () => {
    const selectedFiles = pickedFiles.filter((file) => file.selected);
    if (!selectedFiles.length) {
      showAppDialog({
        title: "Nothing selected",
        message: "Choose at least one attachment before sending.",
        tone: "warning",
      });
      return;
    }

    onSend(selectedFiles);
    clearAll();
    onClose();
  };

  const isImage = (type: string) => type?.startsWith("image/");

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const requestLibraryAccess = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.granted) return true;
    showAppDialog({
      title: "Photo library access needed",
      message: "Allow access to your photos in device settings to attach media.",
      tone: "warning",
    });
    return false;
  };

  const pickImage = async () => {
    if (!(await requestLibraryAccess())) return;
    setOpeningSource(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        addFiles(
          result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.fileName ?? `image_${Date.now()}.jpg`,
            type: asset.mimeType ?? "image/jpeg",
            size: asset.fileSize,
          })),
        );
      }
    } finally {
      setOpeningSource(false);
    }
  };

  const pickVideo = async () => {
    if (!(await requestLibraryAccess())) return;
    setOpeningSource(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
      });
      if (!result.canceled) {
        addFiles(
          result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.fileName ?? `video_${Date.now()}.mp4`,
            type: asset.mimeType ?? "video/mp4",
            size: asset.fileSize,
          })),
        );
      }
    } finally {
      setOpeningSource(false);
    }
  };

  const pickAudio = async () => {
    setOpeningSource(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
      });
      if (!result.canceled) {
        addFiles(
          result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType ?? "audio/mpeg",
            size: asset.size,
          })),
        );
      }
    } finally {
      setOpeningSource(false);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAppDialog({
        title: "Camera access needed",
        message: "Allow camera access in device settings to take a photo.",
        tone: "warning",
      });
      return;
    }

    setOpeningSource(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
      });
      if (!result.canceled) {
        addFiles(
          result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.fileName ?? `image_${Date.now()}.jpg`,
            type: asset.mimeType ?? "image/jpeg",
            size: asset.fileSize,
          })),
        );
      }
    } finally {
      setOpeningSource(false);
    }
  };

  const pickFile = async () => {
    setOpeningSource(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
      });
      if (!result.canceled) {
        addFiles(
          result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType ?? "application/octet-stream",
            size: asset.size,
          })),
        );
      }
    } finally {
      setOpeningSource(false);
    }
  };

  const handlePickSource = (source: (typeof SOURCE_OPTIONS)[number]["key"]) => {
    switch (source) {
      case "camera":
        void takePhoto();
        break;
      case "image":
        void pickImage();
        break;
      case "video":
        void pickVideo();
        break;
      case "audio":
        void pickAudio();
        break;
      case "file":
        void pickFile();
        break;
    }
  };

  const renderFileItem = ({ item }: { item: SelectableFile }) => (
    <View style={styles.fileItem}>
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.selected }}
        onPress={() => toggleSelect(item.uri)}
        style={styles.fileSelect}
        activeOpacity={0.75}
      >
        {isImage(item.type) ? (
          <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        ) : (
          <View style={styles.fileIcon}>
            <Ionicons
              name={item.type.startsWith("video/") ? "videocam-outline" : item.type.startsWith("audio/") ? "musical-notes-outline" : "document-outline"}
              size={20}
              color={theme.COLORS.primary}
            />
          </View>
        )}
        <View style={[styles.checkBadge, item.selected && styles.checkBadgeSelected]}>
          {item.selected ? <Ionicons name="checkmark" size={12} color={theme.COLORS.white} /> : null}
        </View>
      </TouchableOpacity>

      <View style={styles.fileInfo}>
        <Text numberOfLines={1} style={styles.fileName}>{item.name}</Text>
        <Text style={styles.fileSize}>{formatSize(item.size) || "Attachment"}</Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.name}`}
        onPress={() => removeFile(item.uri)}
        style={styles.removeFileButton}
      >
        <Ionicons name="close" size={17} color={theme.COLORS.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.SPACING.xl) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="attach-outline" size={20} color={theme.COLORS.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Add to your message</Text>
              <Text style={styles.subtitle}>Photos, voice notes and files</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close attachments"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={theme.COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.sourceGrid}>
            {SOURCE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                accessibilityRole="button"
                style={styles.sourceTile}
                onPress={() => handlePickSource(option.key)}
                disabled={openingSource}
                activeOpacity={0.75}
              >
                <View style={styles.sourceIcon}>
                  <Ionicons name={option.icon} size={21} color={theme.COLORS.primary} />
                </View>
                <Text style={styles.sourceLabel}>{option.label}</Text>
                <Text style={styles.sourceCaption}>{option.caption}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {openingSource ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.COLORS.primary} />
              <Text style={styles.loadingText}>Opening picker…</Text>
            </View>
          ) : null}

          <View style={styles.selectedHeader}>
            <View>
              <Text style={styles.selectedTitle}>Selected files</Text>
              <Text style={styles.selectedSubtitle}>
                {pickedFiles.length ? `${pickedFiles.length} ready to attach` : "Choose any source above to begin"}
              </Text>
            </View>
            {pickedFiles.length ? (
              <TouchableOpacity onPress={clearAll} activeOpacity={0.75}>
                <Text style={styles.clearText}>Clear all</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {pickedFiles.length ? (
            <FlatList
              data={pickedFiles}
              keyExtractor={(item) => item.uri}
              renderItem={renderFileItem}
              style={styles.fileList}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <View style={styles.emptyFiles}>
              <Ionicons name="add-circle-outline" size={20} color={theme.COLORS.textMuted} />
              <Text style={styles.emptyFilesText}>Your chosen attachments will appear here.</Text>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.selectionCount}>
              {pickedFiles.filter((file) => file.selected).length} selected
            </Text>
            <TouchableOpacity
              style={[
                styles.sendButton,
                !pickedFiles.some((file) => file.selected) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!pickedFiles.some((file) => file.selected)}
              activeOpacity={0.8}
            >
              <Ionicons name="paper-plane" size={16} color={theme.COLORS.white} />
              <Text style={styles.sendButtonText}>Send files</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(20,18,42,0.44)",
  },
  sheet: {
    maxHeight: "91%",
    backgroundColor: theme.COLORS.bgWhite,
    paddingHorizontal: theme.SPACING.xxl,
    paddingTop: theme.SPACING.md,
    paddingBottom: theme.SPACING.xl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#17152B",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 22,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: theme.BORDER_RADIUS.full,
    alignSelf: "center",
    backgroundColor: "#D9D7E3",
    marginBottom: theme.SPACING.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.SPACING.xl,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.primaryGhost,
  },
  headerCopy: {
    flex: 1,
    marginLeft: theme.SPACING.md,
  },
  title: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.xl4,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  subtitle: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    marginTop: 3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: theme.COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.SPACING.sm,
    marginBottom: theme.SPACING.xl,
  },
  sourceTile: {
    width: "31.5%",
    minHeight: 91,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: theme.SPACING.md,
    borderRadius: 17,
    backgroundColor: "#F8F7FC",
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  sourceIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  sourceLabel: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  sourceCaption: {
    color: theme.COLORS.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    marginTop: -theme.SPACING.md,
    marginBottom: theme.SPACING.md,
  },
  loadingText: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.SPACING.md,
  },
  selectedTitle: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.lg,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
  selectedSubtitle: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: 3,
  },
  clearText: {
    color: theme.COLORS.danger,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  fileList: {
    maxHeight: 180,
  },
  fileItem: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECEAF4",
    paddingVertical: theme.SPACING.sm,
  },
  fileSelect: {
    position: "relative",
    marginRight: theme.SPACING.md,
  },
  thumbnail: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: theme.COLORS.bgInput,
  },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: theme.COLORS.primaryGhost,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: theme.COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#D8D6E2",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeSelected: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    color: theme.COLORS.textPrimary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.semibold,
  },
  fileSize: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
    marginTop: 3,
  },
  removeFileButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    marginLeft: theme.SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.COLORS.bgInput,
  },
  emptyFiles: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    borderRadius: 14,
    backgroundColor: "#F8F7FC",
    marginBottom: theme.SPACING.md,
    paddingHorizontal: theme.SPACING.md,
  },
  emptyFilesText: {
    color: theme.COLORS.textMuted,
    fontSize: theme.TYPOGRAPHY.fontSize.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.SPACING.md,
    paddingTop: theme.SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECEAF4",
  },
  selectionCount: {
    color: theme.COLORS.textSecondary,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.medium,
  },
  sendButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.SPACING.sm,
    paddingHorizontal: theme.SPACING.xl,
    borderRadius: 15,
    backgroundColor: theme.COLORS.primary,
    ...theme.SHADOWS.primary,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendButtonText: {
    color: theme.COLORS.white,
    fontSize: theme.TYPOGRAPHY.fontSize.md,
    fontWeight: theme.TYPOGRAPHY.fontWeight.bold,
  },
});
