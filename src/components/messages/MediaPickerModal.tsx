import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Alert,
  FlatList,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, RADIUS, SHADOW, FONT } from "@/constants/theme";
import { PickedFile } from "@/types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (files: PickedFile[]) => void;
}

export default function MediaPickerModal({ visible, onClose, onSend }: Props) {
  const [pickedFiles, setPickedFiles] = useState<
    (PickedFile & { selected: boolean })[]
  >([]);

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  const addFiles = (files: PickedFile[]) => {
    const formatted = files.map((file) => ({
      ...file,
      selected: true,
    }));
    setPickedFiles((prev) => [...prev, ...formatted]);
  };

  const toggleSelect = (uri: string) => {
    setPickedFiles((prev) =>
      prev.map((file) =>
        file.uri === uri ? { ...file, selected: !file.selected } : file,
      ),
    );
  };

  const removeFile = (uri: string) => {
    setPickedFiles((prev) => prev.filter((file) => file.uri !== uri));
  };

  const clearAll = () => setPickedFiles([]);

  const handleSend = () => {
    const selectedFiles = pickedFiles.filter((f) => f.selected);
    if (!selectedFiles.length) {
      Alert.alert("No file selected");
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

  // ─────────────────────────────────────────────
  // Pickers
  // ─────────────────────────────────────────────

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `image_${Date.now()}.jpg`,
          type: a.mimeType ?? "image/jpeg",
          size: a.fileSize,
        })),
      );
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: true,
    });

    if (!result.canceled) {
      addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `video_${Date.now()}.mp4`,
          type: a.mimeType ?? "video/mp4",
          size: a.fileSize,
        })),
      );
    }
  };

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      multiple: true,
    });

    if (!result.canceled) {
      addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType ?? "audio/mpeg",
          size: a.size,
        })),
      );
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled) {
      addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.fileName ?? `image_${Date.now()}.jpg`,
          type: a.mimeType ?? "image/jpeg",
          size: a.fileSize,
        })),
      );
    }
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
    });

    if (!result.canceled) {
      addFiles(
        result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType ?? "application/octet-stream",
          size: a.size,
        })),
      );
    }
  };

  // ─────────────────────────────────────────────
  // Render File Item
  // ─────────────────────────────────────────────

  const renderFileItem = ({ item }: any) => (
    <View style={styles.fileItem}>
      <TouchableOpacity onPress={() => toggleSelect(item.uri)}>
        {isImage(item.type) ? (
          <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        ) : (
          <View style={styles.fileIcon}>
            <Ionicons
              name="document-outline"
              size={22}
              color={COLORS.primary}
            />
          </View>
        )}

        {/* Check badge */}
        <View
          style={[
            styles.checkBadge,
            {
              backgroundColor: item.selected ? COLORS.primary : COLORS.bgWhite,
            },
          ]}
        >
          {item.selected && (
            <Ionicons name="checkmark" size={14} color="#fff" />
          )}
        </View>
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.fileName}>
          {item.name}
        </Text>
        <Text style={styles.fileSize}>{formatSize(item.size)}</Text>
      </View>

      <TouchableOpacity onPress={() => removeFile(item.uri)}>
        <Ionicons name="close" size={18} color={COLORS.danger} />
      </TouchableOpacity>
    </View>
  );

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContainer}>
          <View style={styles.handle} />
          <Text style={styles.title}>Attach Files</Text>

          {/* Picker Options */}
          <View style={styles.optionsRow}>
            <Option icon="camera-outline" label="Camera" onPress={takePhoto} />
            <Option icon="image-outline" label="Image" onPress={pickImage} />
            <Option icon="videocam-outline" label="Video" onPress={pickVideo} />
            <Option
              icon="musical-notes-outline"
              label="Audio"
              onPress={pickAudio}
            />
            <Option icon="document-outline" label="File" onPress={pickFile} />
          </View>

          {/* Selected Files */}
          {pickedFiles.length > 0 && (
            <>
              <FlatList
                data={pickedFiles}
                keyExtractor={(item) => item.uri}
                renderItem={renderFileItem}
                style={{ marginTop: SPACING.lg }}
              />

              <View style={styles.actionsRow}>
                <TouchableOpacity onPress={clearAll}>
                  <Text style={{ color: COLORS.danger }}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                  <Text style={{ color: "#fff", fontWeight: FONT.semibold }}>
                    Send ({pickedFiles.filter((f) => f.selected).length})
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Option Button
// ─────────────────────────────────────────────

const Option = ({ icon, label, onPress }: any) => (
  <TouchableOpacity style={styles.option} onPress={onPress}>
    <Ionicons name={icon} size={22} color={COLORS.primary} />
    <Text style={styles.optionText}>{label}</Text>
  </TouchableOpacity>
);

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  modalContainer: {
    backgroundColor: COLORS.bgWhite,
    padding: SPACING.xl,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: "85%",
  },
  handle: {
    width: 50,
    height: 5,
    backgroundColor: COLORS.textMuted,
    borderRadius: RADIUS.full,
    alignSelf: "center",
    marginBottom: SPACING.lg,
    opacity: 0.4,
  },
  title: {
    fontSize: 16,
    fontWeight: FONT.semibold,
    textAlign: "center",
    marginBottom: SPACING.lg,
    color: COLORS.textPrimary,
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  option: {
    alignItems: "center",
  },
  optionText: {
    fontSize: 12,
    marginTop: 4,
    color: COLORS.textSecondary,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.md,
    marginRight: SPACING.md,
  },
  fileIcon: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryGhost,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  fileName: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: FONT.medium,
  },
  fileSize: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  checkBadge: {
    position: "absolute",
    top: -6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    ...SHADOW.primary,
  },
});
