import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppSelector } from "@/store/hooks";
import { useRooms } from "@/hooks/useRooms";
import {
  shareIntentInbox,
  useShareIntentDraft,
  type SharedDraftFile,
} from "@/services/ShareIntentInbox";
import {
  discardStagedFile,
  safeSharedFileName,
  sharedFileLabel,
  stageSharedFile,
} from "@/services/SharedMedia";
import { mediaFileForUpload } from "@/utils/mediaUpload";
import { mediaService } from "@/services/MediaService";
import { showAppDialog } from "@/services/AppDialogService";
import type { AttachmentInfo } from "@/utils/messaging/presentation";
import { BORDER_RADIUS, COLORS, SPACING, TYPOGRAPHY } from "@/constants/theme";

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreview({ file, onRemove }: { file: SharedDraftFile; onRemove: () => void }) {
  const image = file.mimeType.startsWith("image/");
  return (
    <View style={styles.preview}>
      {image ? (
        <Image source={{ uri: file.uri }} style={styles.previewImage} />
      ) : (
        <View style={styles.previewIcon}>
          <Ionicons
            name={
              file.mimeType.startsWith("video/")
                ? "videocam-outline"
                : file.mimeType.startsWith("audio/")
                  ? "musical-notes-outline"
                  : "document-outline"
            }
            size={24}
            color={COLORS.primary}
          />
        </View>
      )}
      <Text numberOfLines={1} style={styles.previewName}>
        {file.name}
      </Text>
      <Text style={styles.previewSize}>
        {formatBytes(file.size) || file.mimeType.split("/").pop()}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Remove ${file.name}`}
        style={styles.remove}
        onPress={onRemove}
      >
        <Ionicons name="close" size={15} color={COLORS.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

export default function ShareIntentScreen() {
  const draft = useShareIntentDraft();
  const user = useAppSelector((state) => state.auth.user);
  const { rooms, loading, reload } = useRooms();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);

  const destinations = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return rooms
      .filter((room) => !room.archived)
      .filter((room) =>
        value ? room.name.toLocaleLowerCase().includes(value) : true,
      );
  }, [query, rooms]);

  const selected = destinations.find((room) => room.id === selectedId);

  const send = useCallback(async () => {
    if (!selected || sending || !draft.files.length || !user?.id) return;
    setSending(true);
    const failures: string[] = [];
    const sentIds: string[] = [];
    let done = 0;
    for (let index = 0; index < draft.files.length; index++) {
      const file = draft.files[index];
      setProgress({ index: index + 1, total: draft.files.length });
      let name = safeSharedFileName(file.name, file.mimeType, index);
      try {
        const staged = await stageSharedFile({ ...file, name }, index);
        name = staged.name;
        const attachment: AttachmentInfo = {
          name: staged.name,
          size: staged.size,
          mimeType: staged.mimeType,
          width: staged.width,
          height: staged.height,
        };
        // Reuse the exact picker/composer validation before the normal upload.
        mediaFileForUpload(staged.uri, attachment);
        await mediaService.message.sendMediaRecord(
          staged.mimeType,
          staged.uri,
          {
            senderId: user.id,
            receiverId: selected.receiverId ?? null,
            conversationId: selected.conversationId,
            sender: {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
            },
          },
          staged.duration,
          undefined,
          attachment,
        );
        done += 1;
        sentIds.push(file.id);
        await discardStagedFile(staged.uri);
      } catch (error) {
        failures.push(
          `${name}: ${error instanceof Error ? error.message : "upload failed"}`,
        );
      }
    }
    setSending(false);
    setProgress(null);

    if (failures.length) {
      // Already-uploaded files must never be sent twice on retry.
      for (const id of sentIds) shareIntentInbox.remove(id);
      showAppDialog({
        title: done ? "Some attachments weren’t sent" : "Couldn’t share attachments",
        message: failures.join("\n"),
        tone: "error",
      });
      return;
    }

    shareIntentInbox.clear();
    showAppDialog({
      title: "Shared to chat",
      message: `${sharedFileLabel(done)} sent to ${selected.name}.`,
      tone: "success",
    });
    router.replace({
      pathname: "/(chatRoom)/privateRoom",
      params: {
        roomId: selected.id,
        conversationId: selected.conversationId,
        receiverId: selected.receiverId ?? "",
        receiverName: selected.name,
        receiverUsername: selected.receiverUsername ?? "",
        receiverAvatar: selected.avatarUrl ?? "",
        isGroup: String(selected.isGroup),
      },
    });
  }, [draft.files, selected, sending, user]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cancel sharing"
          style={styles.back}
          onPress={() => {
            shareIntentInbox.clear();
            router.back();
          }}
        >
          <Ionicons name="close" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>FROM ANOTHER APP</Text>
          <Text style={styles.title}>Share to chat</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Send shared attachments"
          style={[styles.send, (!selected || sending) && styles.sendDisabled]}
          disabled={!selected || sending}
          onPress={() => void send()}
        >
          {sending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Ionicons name="paper-plane" size={17} color={COLORS.white} />
          )}
        </TouchableOpacity>
      </View>

      {draft.files.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.previews}
        >
          {draft.files.map((file) => (
            <FilePreview
              key={file.id}
              file={file}
              onRemove={() => shareIntentInbox.remove(file.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyFiles}>
          <Ionicons name="attach-outline" size={24} color={COLORS.primary} />
          <Text style={styles.emptyTitle}>Nothing left to share</Text>
          <Text style={styles.emptyCopy}>Close this screen and share again.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Send to</Text>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={17} color={COLORS.textMuted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      {sending && progress && (
        <View style={styles.progressRow}>
          <ActivityIndicator color={COLORS.primary} size="small" />
          <Text style={styles.progressText}>
            Uploading {progress.index} of {progress.total}…
          </Text>
        </View>
      )}

      <FlatList
        data={destinations}
        keyExtractor={(room) => room.conversationId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <>
                <Text style={styles.emptyCopy}>
                  {query ? "No matching conversations" : "No conversations yet."}
                </Text>
                <TouchableOpacity onPress={() => void reload()}>
                  <Text style={styles.retry}>Refresh</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const chosen = item.id === selectedId;
          return (
            <TouchableOpacity
              style={[styles.room, chosen && styles.roomSelected]}
              onPress={() => setSelectedId(item.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={`Share to ${item.name}`}
              activeOpacity={0.78}
            >
              <View style={styles.avatar}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons
                    name={item.isGroup ? "people-outline" : "person-outline"}
                    size={20}
                    color={COLORS.primary}
                  />
                )}
              </View>
              <View style={styles.roomCopy}>
                <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.roomMeta} numberOfLines={1}>
                  {item.isGroup ? "Group conversation" : "Direct message"}
                </Text>
              </View>
              <View style={[styles.radio, chosen && styles.radioOn]}>
                {chosen && <Ionicons name="checkmark" size={13} color={COLORS.white} />}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgMain },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgWhite,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl4,
    fontWeight: "700",
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  sendDisabled: { opacity: 0.45 },
  previews: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  preview: {
    width: 108,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  previewImage: { width: "100%", height: 66, borderRadius: 10, backgroundColor: COLORS.bgInput },
  previewIcon: {
    width: "100%",
    height: 66,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
  },
  previewName: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
  },
  previewSize: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  remove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  emptyFiles: {
    marginHorizontal: SPACING.lg,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xxl,
    backgroundColor: COLORS.bgWhite,
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: { color: COLORS.textPrimary, fontWeight: "600" },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: "700",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: COLORS.bgWhite,
  },
  search: { flex: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.md },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  progressText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl },
  room: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 64,
    paddingHorizontal: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.xs,
  },
  roomSelected: { backgroundColor: COLORS.primaryGhost },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryGhost,
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  roomCopy: { flex: 1, minWidth: 0 },
  roomName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "600" },
  roomMeta: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#D8D6E2",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  empty: { alignItems: "center", padding: SPACING.xl, gap: SPACING.sm },
  emptyCopy: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
  retry: { color: COLORS.primary, fontWeight: "600" },
});
