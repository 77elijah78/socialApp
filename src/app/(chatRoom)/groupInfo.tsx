import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { SkeletonBox } from "@/components/ui";
import { pickFromLibrary } from "@/hooks/useImagePicker";
import { useRateLimit } from "@/hooks/useRateLimit";
import { useUserSearch } from "@/hooks/useUserSearch";
import { useAppSelector } from "@/store/hooks";
import { roomStore } from "@/db/RoomStore";
import { uploadAvatarAsset } from "@/services/AvatarService";
import {
  type GroupInfo,
  type GroupMember,
  groupService,
} from "@/services/GroupService";
import { showAppDialog } from "@/services/AppDialogService";
import {
  BORDER_RADIUS,
  COLORS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Params {
  conversationId: string;
  name?: string;
  avatarUrl?: string;
  memberCount?: string;
}

function memberName(member: GroupMember) {
  return member.displayName || member.username;
}

export default function GroupInfoScreen() {
  const params = useLocalSearchParams() as unknown as Params;
  const conversationId = params.conversationId ?? "";
  const currentUserId = useAppSelector((state) => state.auth.user?.id);
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(params.name ?? "");
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addSelected, setAddSelected] = useState<Set<string>>(new Set());
  const mounted = useRef(true);
  const actionInFlight = useRef(false);
  const messagingLimit = useRateLimit("messaging");
  const mediaLimit = useRateLimit("media");
  const search = useUserSearch(adding ? addQuery : "");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await groupService.getGroup(conversationId, currentUserId);
      if (!mounted.current) return;
      setGroup(next);
      setNameDraft(next.name);
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t load this group.",
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [conversationId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const syncRoom = useCallback(
    async (next: GroupInfo) => {
      const [room] = await roomStore.findRoom(conversationId);
      if (!room) return;
      await roomStore.updateRoom(conversationId, {
        name: next.name,
        avatarUrl: next.avatarUrl ?? "",
        participantsData: JSON.stringify(
          next.members.map((member) => ({
            id: member.userId,
            username: member.username,
            displayName: member.displayName,
            avatarUrl: member.avatarUrl,
          })),
        ),
      });
    },
    [conversationId],
  );

  const applyUpdate = useCallback(
    async (next: GroupInfo) => {
      setGroup(next);
      setNameDraft(next.name);
      await syncRoom(next).catch(() => {});
    },
    [syncRoom],
  );

  const saveName = useCallback(async () => {
    if (!group || busy || actionInFlight.current || messagingLimit.blocked) return;
    const name = nameDraft.trim();
    if (!name) {
      setError("Group name can’t be empty.");
      return;
    }
    if (name === group.name) {
      setEditingName(false);
      return;
    }
    actionInFlight.current = true;
    setBusy("name");
    setError(null);
    try {
      const next = await groupService.updateGroup(conversationId, { name });
      await applyUpdate(next);
      setEditingName(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t rename the group.");
    } finally {
      actionInFlight.current = false;
      setBusy(null);
    }
  }, [applyUpdate, busy, conversationId, group, messagingLimit.blocked, nameDraft]);

  const changePhoto = useCallback(async () => {
    if (!group?.canManage || busy || actionInFlight.current || mediaLimit.blocked) return;
    actionInFlight.current = true;
    try {
      const picked = await pickFromLibrary({ mediaTypes: "images", allowsEditing: true, aspect: [1, 1] });
      const asset = Array.isArray(picked) ? picked[0] : picked;
      if (!asset) return;
      setBusy("photo");
      setError(null);
      const uploaded = await uploadAvatarAsset(asset);
      const next = await groupService.updateGroup(conversationId, {
        avatarUrl: uploaded.url,
      });
      await applyUpdate(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t update the group photo.");
    } finally {
      actionInFlight.current = false;
      setBusy(null);
    }
  }, [applyUpdate, busy, conversationId, group?.canManage, mediaLimit.blocked]);

  const addMembers = useCallback(async () => {
    if (!group || busy || actionInFlight.current || messagingLimit.blocked || !addSelected.size) return;
    actionInFlight.current = true;
    setBusy("add");
    setError(null);
    try {
      const next = await groupService.addMembers(conversationId, [...addSelected]);
      await applyUpdate(next);
      setAddSelected(new Set());
      setAddQuery("");
      setAdding(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t add those members.");
    } finally {
      actionInFlight.current = false;
      setBusy(null);
    }
  }, [addSelected, applyUpdate, busy, conversationId, group, messagingLimit.blocked]);

  const removeMember = useCallback(
    (member: GroupMember) => {
      showAppDialog({
        title: `Remove ${memberName(member)}?`,
        message: "They will stop receiving messages from this group.",
        tone: "warning",
        buttons: [
          { key: "cancel", label: "Cancel", cancel: true },
          {
            key: "remove",
            label: "Remove",
            destructive: true,
            onPress: async () => {
              if (actionInFlight.current || messagingLimit.blocked) return;
              actionInFlight.current = true;
              setBusy(`remove:${member.userId}`);
              setError(null);
              try {
                await groupService.removeMember(conversationId, member.userId);
                await load();
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Couldn’t remove that member.");
              } finally {
                actionInFlight.current = false;
                setBusy(null);
              }
            },
          },
        ],
      });
    },
    [conversationId, load, messagingLimit.blocked],
  );

  const changeRole = useCallback(
    (member: GroupMember) => {
      const nextRole = member.role === "admin" ? "member" : "admin";
      showAppDialog({
        title: `${nextRole === "admin" ? "Make admin" : "Remove admin"}?`,
        message:
          nextRole === "admin"
            ? `${memberName(member)} will be able to manage members and group settings.`
            : `${memberName(member)} will become a regular member.`,
        presentation: "sheet",
        tone: "action",
        buttons: [
          { key: "cancel", label: "Cancel", cancel: true },
          {
            key: "confirm",
            label: nextRole === "admin" ? "Make admin" : "Remove admin",
            bold: true,
            onPress: async () => {
              if (actionInFlight.current || messagingLimit.blocked) return;
              actionInFlight.current = true;
              setBusy(`role:${member.userId}`);
              setError(null);
              try {
                const next = await groupService.setRole(conversationId, member.userId, nextRole);
                await applyUpdate(next);
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Couldn’t change that role.");
              } finally {
                actionInFlight.current = false;
                setBusy(null);
              }
            },
          },
        ],
      });
    },
    [applyUpdate, conversationId, messagingLimit.blocked],
  );

  const leave = useCallback(() => {
    showAppDialog({
      title: "Leave this group?",
      message: "You’ll stop receiving its messages. You can be added back later.",
      tone: "warning",
      buttons: [
        { key: "cancel", label: "Stay", cancel: true },
        {
          key: "leave",
          label: "Leave group",
          destructive: true,
          onPress: async () => {
            if (actionInFlight.current || messagingLimit.blocked) return;
            actionInFlight.current = true;
            setBusy("leave");
            try {
              await groupService.leaveGroup(conversationId);
              const [room] = await roomStore.findRoom(conversationId);
              if (room) await roomStore.deleteOne(room.id);
              router.replace("/(tabs)/messages");
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : "Couldn’t leave the group.");
              setBusy(null);
            } finally {
              actionInFlight.current = false;
            }
          },
        },
      ],
    });
  }, [conversationId, messagingLimit.blocked]);

  const existingIds = useMemo(
    () => new Set(group?.members.map((member) => member.userId) ?? []),
    [group?.members],
  );
  const candidates = useMemo(
    () => search.users.filter((user) => !existingIds.has(user.id)),
    [existingIds, search.users],
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Group info" />
        <View style={styles.loadingBody}>
          <SkeletonBox height={92} borderRadius={24} />
          <SkeletonBox height={48} borderRadius={16} />
          <SkeletonBox height={220} borderRadius={24} />
        </View>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.screen}>
        <PageHeader title="Group info" />
        <View style={styles.center}>
          <Ionicons name="people-outline" size={34} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Group unavailable</Text>
          <Text style={styles.emptyText}>{error ?? "This group could not be loaded."}</Text>
          <PrimaryButton title="Try again" onPress={() => void load()} style={styles.retry} />
        </View>
      </View>
    );
  }

  const canManage = group.canManage && group.managementAvailable;
  const isOwner = group.myRole === "owner";

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Group info"
        subtitle={`${group.memberCount} member${group.memberCount === 1 ? "" : "s"}`}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Pressable
            onPress={() => void changePhoto()}
            disabled={!canManage || busy === "photo" || mediaLimit.blocked}
            accessibilityRole={canManage ? "button" : undefined}
            accessibilityLabel={canManage ? "Change group photo" : undefined}
            style={styles.heroAvatar}
          >
            {group.avatarUrl ? (
              <Image source={{ uri: group.avatarUrl }} style={styles.heroAvatarImage} contentFit="cover" />
            ) : (
              <View style={[styles.heroAvatarImage, styles.heroAvatarFallback]}>
                <Text style={styles.heroInitial}>{group.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {canManage ? (
              <View style={styles.cameraBadge}>
                {busy === "photo" ? (
                  <ActivityIndicator size="small" color={COLORS.textWhite} />
                ) : (
                  <Ionicons name="camera" size={14} color={COLORS.textWhite} />
                )}
              </View>
            ) : null}
          </Pressable>

          {editingName ? (
            <View style={styles.nameEdit}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                style={styles.nameInput}
                maxLength={80}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void saveName()}
              />
              <Pressable onPress={() => void saveName()} disabled={busy === "name"} style={styles.saveName}>
                {busy === "name" ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="checkmark" size={22} color={COLORS.primary} />}
              </Pressable>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.heroName} numberOfLines={2}>{group.name}</Text>
              {canManage ? (
                <Pressable onPress={() => setEditingName(true)} accessibilityRole="button" accessibilityLabel="Rename group">
                  <Ionicons name="pencil" size={18} color={COLORS.primary} />
                </Pressable>
              ) : null}
            </View>
          )}
          {!group.managementAvailable ? (
            <Text style={styles.managedElsewhere}>
              Group management isn’t available on this server yet. Member details below are read-only.
            </Text>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={19} color={COLORS.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {canManage ? (
          <View style={styles.actionCard}>
            <Pressable
              style={styles.actionRow}
              onPress={() => {
                setAdding((value) => !value);
                setAddQuery("");
                setAddSelected(new Set());
              }}
              accessibilityRole="button"
            >
              <View style={styles.actionIcon}><Ionicons name="person-add-outline" size={20} color={COLORS.primary} /></View>
              <Text style={styles.actionLabel}>Add members</Text>
              <Ionicons name={adding ? "chevron-up" : "chevron-forward"} size={18} color={COLORS.textMuted} />
            </Pressable>
            {adding ? (
              <View style={styles.addPanel}>
                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={17} color={COLORS.textMuted} />
                  <TextInput
                    value={addQuery}
                    onChangeText={setAddQuery}
                    placeholder="Search people"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    style={styles.searchInput}
                  />
                  {search.loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
                </View>
                {search.error ? (
                  <Pressable onPress={() => void search.retry()}><Text style={styles.inlineError}>{search.error} Tap to retry.</Text></Pressable>
                ) : null}
                {addQuery.trim() && !search.loading && !candidates.length ? (
                  <Text style={styles.noResults}>No one else found for “{addQuery.trim()}”.</Text>
                ) : null}
                {candidates.map((user) => {
                  const checked = addSelected.has(user.id);
                  return (
                    <Pressable
                      key={user.id}
                      style={styles.candidateRow}
                      onPress={() =>
                        setAddSelected((current) => {
                          const next = new Set(current);
                          if (next.has(user.id)) next.delete(user.id);
                          else next.add(user.id);
                          return next;
                        })
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                    >
                      <Text style={styles.candidateName} numberOfLines={1}>{user.displayName || user.username}</Text>
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked ? <Ionicons name="checkmark" size={14} color={COLORS.textWhite} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
                {addSelected.size ? (
                  <PrimaryButton
                    title={`Add ${addSelected.size} member${addSelected.size > 1 ? "s" : ""}`}
                    onPress={() => void addMembers()}
                    loading={busy === "add"}
                    disabled={Boolean(busy) || messagingLimit.blocked}
                    style={styles.addButton}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.membersCard}>
          <Text style={styles.sectionTitle}>{group.memberCount} members</Text>
          {group.members.map((member) => {
            const isMe = member.userId === currentUserId;
            const rowBusy =
              busy === `remove:${member.userId}` || busy === `role:${member.userId}`;
            return (
              <View key={member.userId} style={styles.memberRow}>
                {member.avatarUrl ? (
                  <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
                    <Text style={styles.memberInitial}>{memberName(member).charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {memberName(member)}{isMe ? " (you)" : ""}
                  </Text>
                  <Text style={styles.memberHandle} numberOfLines={1}>@{member.username}</Text>
                </View>
                {member.role !== "member" ? (
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{member.role === "owner" ? "Owner" : "Admin"}</Text>
                  </View>
                ) : null}
                {canManage && !isMe && member.role !== "owner" && !rowBusy ? (
                  <Pressable
                    onPress={() =>
                      showAppDialog({
                        title: memberName(member),
                        presentation: "sheet",
                        tone: "action",
                        buttons: [
                          { key: "cancel", label: "Cancel", cancel: true },
                          ...(isOwner
                            ? [{ key: "role", label: member.role === "admin" ? "Remove admin" : "Make admin", icon: "shield-outline" as const, onPress: () => changeRole(member) }]
                            : []),
                          { key: "remove", label: "Remove from group", destructive: true, icon: "person-remove-outline", onPress: () => removeMember(member) },
                        ],
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${memberName(member)}`}
                    style={styles.memberMenu}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
                  </Pressable>
                ) : rowBusy ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : null}
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={leave}
          disabled={Boolean(busy) || !group.managementAvailable}
          accessibilityRole="button"
          style={[styles.leaveButton, (!group.managementAvailable || Boolean(busy)) && styles.disabled]}
        >
          {busy === "leave" ? <ActivityIndicator size="small" color={COLORS.red} /> : <Ionicons name="exit-outline" size={20} color={COLORS.red} />}
          <Text style={styles.leaveText}>Leave group</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  loadingBody: { padding: SPACING.xl, gap: SPACING.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xxxl, gap: SPACING.md },
  retry: { alignSelf: "stretch", marginTop: SPACING.lg },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "700" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.lg, textAlign: "center" },
  content: { padding: SPACING.xl, gap: SPACING.lg },
  hero: { alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.md },
  heroAvatar: { width: 104, height: 104, borderRadius: 36, overflow: "visible" },
  heroAvatarImage: { width: 104, height: 104, borderRadius: 36, backgroundColor: COLORS.primaryGhost },
  heroAvatarFallback: { alignItems: "center", justifyContent: "center" },
  heroInitial: { color: COLORS.primary, fontSize: 40, fontWeight: "700" },
  cameraBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.bgMain,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  heroName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl7, fontWeight: "700", textAlign: "center", maxWidth: 280 },
  nameEdit: { flexDirection: "row", alignItems: "center", gap: SPACING.md, alignSelf: "stretch", paddingHorizontal: SPACING.xxxl },
  nameInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.bgWhite,
    paddingHorizontal: SPACING.lg,
    color: COLORS.textPrimary,
    fontSize: TYPOGRAPHY.fontSize.xl5,
    fontWeight: "600",
  },
  saveName: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: COLORS.primaryGhost },
  managedElsewhere: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center", paddingHorizontal: SPACING.xl },
  errorBanner: { flexDirection: "row", gap: SPACING.md, padding: SPACING.lg, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.dangerLight },
  errorText: { flex: 1, color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.lg, lineHeight: 19 },
  actionCard: { borderRadius: BORDER_RADIUS.xxxxxl, backgroundColor: COLORS.bgWhite, overflow: "hidden", borderWidth: 1, borderColor: "#ECEAF4" },
  actionRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingHorizontal: SPACING.lg },
  actionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryGhost },
  actionLabel: { flex: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "600" },
  addPanel: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F0EEF7", paddingTop: SPACING.lg },
  searchBox: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.bgInput, paddingHorizontal: SPACING.md },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg },
  inlineError: { color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.md },
  noResults: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md, paddingVertical: SPACING.md },
  candidateRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: SPACING.md },
  candidateName: { flex: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.lg },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: COLORS.borderGray, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  addButton: { minHeight: 46, paddingVertical: SPACING.md },
  membersCard: { borderRadius: BORDER_RADIUS.xxxxxl, backgroundColor: COLORS.bgWhite, borderWidth: 1, borderColor: "#ECEAF4", overflow: "hidden" },
  sectionTitle: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  memberRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingHorizontal: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F4F2F9" },
  memberAvatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: COLORS.primaryGhost },
  memberAvatarFallback: { alignItems: "center", justifyContent: "center" },
  memberInitial: { color: COLORS.primary, fontSize: TYPOGRAPHY.fontSize.xl4, fontWeight: "700" },
  memberCopy: { flex: 1, minWidth: 0 },
  memberName: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "600" },
  memberHandle: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md },
  roleBadge: { paddingHorizontal: SPACING.md, paddingVertical: 3, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.primaryGhost },
  roleText: { color: COLORS.primaryDark, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "700" },
  memberMenu: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  leaveButton: {
    marginTop: SPACING.sm,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.dangerLight,
  },
  leaveText: { color: COLORS.red, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
