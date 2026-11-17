import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PageHeader from "@/components/common/PageHeader";
import PrimaryButton from "@/components/common/PrimaryButton";
import { useUserSearch, type UserSearchResult } from "@/hooks/useUserSearch";
import { useRateLimit } from "@/hooks/useRateLimit";
import { pickFromLibrary } from "@/hooks/useImagePicker";
import { uploadAvatarAsset } from "@/services/AvatarService";
import { groupService } from "@/services/GroupService";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

function initials(user: UserSearchResult) {
  return (user.displayName || user.username).trim().charAt(0).toUpperCase();
}

export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<UserSearchResult[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { users, loading, error: searchError, retry } = useUserSearch(query);
  const messagingLimit = useRateLimit("messaging");
  const mediaLimit = useRateLimit("media");

  const selectedIds = useMemo(() => new Set(selected.map((user) => user.id)), [selected]);
  const toggle = useCallback((user: UserSearchResult) => {
    setSelected((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user],
    );
  }, []);

  const chooseAvatar = useCallback(async () => {
    if (uploadingAvatar || mediaLimit.blocked) return;
    try {
      const picked = await pickFromLibrary({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: [1, 1],
      });
      const asset = Array.isArray(picked) ? picked[0] : picked;
      if (!asset) return;
      setAvatarUri(asset.uri);
      setUploadingAvatar(true);
      setError(null);
      const uploaded = await uploadAvatarAsset(asset);
      setAvatarUrl(uploaded.url);
    } catch (failure) {
      setAvatarUri(null);
      setAvatarUrl(null);
      setError(failure instanceof Error ? failure.message : "Couldn’t upload that photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }, [mediaLimit.blocked, uploadingAvatar]);

  const create = useCallback(async () => {
    if (inFlight.current || creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your group a name.");
      return;
    }
    if (!selected.length) {
      setError("Add at least one person to the group.");
      return;
    }
    if (uploadingAvatar) {
      setError("Wait for the group photo to finish uploading.");
      return;
    }
    inFlight.current = true;
    setCreating(true);
    setError(null);
    try {
      const group = await groupService.createGroup({
        name: trimmed,
        memberIds: selected.map((user) => user.id),
        avatarUrl,
      });
      router.replace({
        pathname: "/(chatRoom)/privateRoom",
        params: {
          conversationId: group.id,
          roomId: group.id,
          isGroup: "true",
          receiverName: group.name,
          receiverUsername: "",
          receiverAvatar: group.avatarUrl ?? "",
          receiverId: "",
          memberCount: String(group.memberCount),
        },
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t create the group. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  }, [avatarUrl, creating, name, selected, uploadingAvatar]);

  return (
    <View style={styles.screen}>
      <PageHeader title="New group" subtitle={`${selected.length + 1} member${selected.length ? "s" : ""}`} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identityRow}>
            <Pressable
              onPress={() => void chooseAvatar()}
              disabled={uploadingAvatar || mediaLimit.blocked}
              accessibilityRole="button"
              accessibilityLabel={avatarUri ? "Change group photo" : "Add group photo"}
              style={styles.avatarButton}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Ionicons name="camera-outline" size={26} color={COLORS.primary} />
              )}
              {uploadingAvatar ? (
                <View style={styles.avatarBusy}>
                  <ActivityIndicator color={COLORS.textWhite} />
                </View>
              ) : null}
            </Pressable>
            <View style={styles.nameField}>
              <Text style={styles.label}>Group name</Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setError(null);
                }}
                placeholder="Weekend crew"
                placeholderTextColor={COLORS.textMuted}
                style={styles.nameInput}
                maxLength={80}
                editable={!creating}
                returnKeyType="done"
              />
            </View>
          </View>

          {selected.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {selected.map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => toggle(user)}
                  style={styles.chip}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${user.displayName || user.username}`}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
                    {user.displayName || user.username}
                  </Text>
                  <Ionicons name="close" size={14} color={COLORS.primaryDark} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search people by name or @username"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
              editable={!creating}
            />
            {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
          </View>

          {searchError ? (
            <Pressable style={styles.inlineError} onPress={() => void retry()} accessibilityRole="button">
              <Text style={styles.inlineErrorText}>{searchError} Tap to retry.</Text>
            </Pressable>
          ) : null}

          {!query.trim() ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Find your people</Text>
              <Text style={styles.emptyText}>Search for people you already follow or know.</Text>
            </View>
          ) : !loading && !users.length && !searchError ? (
            <View style={styles.empty}>
              <Ionicons name="person-add-outline" size={28} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No one found</Text>
              <Text style={styles.emptyText}>Try a different name or username.</Text>
            </View>
          ) : (
            <View style={styles.results}>
              {users.map((user) => {
                const checked = selectedIds.has(user.id);
                return (
                  <Pressable
                    key={user.id}
                    style={styles.userRow}
                    onPress={() => toggle(user)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={user.displayName || user.username}
                  >
                    {user.avatarUrl ? (
                      <Image source={{ uri: user.avatarUrl }} style={styles.userAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                        <Text style={styles.userInitial}>{initials(user)}</Text>
                      </View>
                    )}
                    <View style={styles.userCopy}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {user.displayName || user.username}
                      </Text>
                      <Text style={styles.userHandle} numberOfLines={1}>@{user.username}</Text>
                    </View>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked ? <Ionicons name="checkmark" size={16} color={COLORS.textWhite} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={20} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          {messagingLimit.blocked ? (
            <Text style={styles.cooldown}>You can create a group in {messagingLimit.countdown}.</Text>
          ) : null}
          <PrimaryButton
            title="Create group"
            onPress={() => void create()}
            loading={creating}
            loadingLabel="Creating…"
            disabled={creating || uploadingAvatar || messagingLimit.blocked}
            testID="create-group-submit"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  flex: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.xl },
  identityRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xl },
  avatarButton: {
    width: 78,
    height: 78,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    overflow: "hidden",
    ...SHADOWS.sm,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarBusy: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,26,46,0.4)",
  },
  nameField: { flex: 1 },
  label: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginBottom: SPACING.xs,
  },
  nameInput: {
    minHeight: 48,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    paddingHorizontal: SPACING.lg,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl4,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  chips: { gap: SPACING.sm, paddingRight: SPACING.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primaryGhost,
  },
  chipText: { maxWidth: 130, color: COLORS.primaryDark, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "600" },
  searchBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl },
  inlineError: { padding: SPACING.lg, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.dangerLight },
  inlineErrorText: { color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.lg },
  empty: {
    alignItems: "center",
    paddingVertical: SPACING.xxxxl,
    gap: SPACING.sm,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl4, fontWeight: "700" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
  results: {
    borderRadius: BORDER_RADIUS.xxxxxl,
    backgroundColor: COLORS.bgWhite,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ECEAF4",
  },
  userRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0EEF7",
  },
  userAvatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: COLORS.primaryGhost },
  userAvatarFallback: { alignItems: "center", justifyContent: "center" },
  userInitial: { color: COLORS.primary, fontWeight: "700", fontSize: TYPOGRAPHY.fontSize.xl4 },
  userCopy: { flex: 1, minWidth: 0 },
  userName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xxl, fontWeight: "600" },
  userHandle: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.borderGray,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.dangerLight,
  },
  errorText: { flex: 1, color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.lg, lineHeight: 19 },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.bgMain,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4E1EE",
    gap: SPACING.sm,
  },
  cooldown: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
});
