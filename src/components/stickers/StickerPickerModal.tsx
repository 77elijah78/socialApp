import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StickerImage from "./StickerImage";
import { useStickerCatalog } from "@/hooks/useStickers";
import { showAppDialog } from "@/services/AppDialogService";
import { stickerAppearsInSearch } from "@/services/StickerService";
import type { Sticker } from "@/constants/stickers";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (sticker: Sticker) => void;
  userId?: string;
}

const COLUMNS = 4;

export default function StickerPickerModal({
  visible,
  onClose,
  onSelect,
  userId,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const catalog = useStickerCatalog(userId);
  const [tab, setTab] = useState<string>("recents");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (searchOpen) setTimeout(() => input.current?.focus(), 120);
  }, [searchOpen]);

  const effectiveTab =
    tab === "recents" || tab === "favorites" || catalog.isInstalled(tab)
      ? tab
      : catalog.installedPacks[0]?.id ?? "recents";
  const activePack = catalog.installedPacks.find((pack) => pack.id === effectiveTab);
  const stickers = useMemo(() => {
    const pool = query.trim()
      ? catalog.installedPacks.flatMap((pack) => pack.stickers)
      : effectiveTab === "favorites"
        ? catalog.favorites
        : effectiveTab === "recents"
          ? catalog.recents
          : activePack?.stickers ?? [];
    return query.trim()
      ? pool.filter((sticker) => stickerAppearsInSearch(sticker, query))
      : pool;
  }, [activePack?.stickers, catalog.favorites, catalog.installedPacks, catalog.recents, query, effectiveTab]);

  const tile = Math.max(58, (width - SPACING.xl * 2 - SPACING.md * (COLUMNS - 1)) / COLUMNS);
  const close = () => {
    setSearchOpen(false);
    setQuery("");
    onClose();
  };

  const closeAndStore = () => {
    close();
    router.push("/stickers");
  };

  const choose = (sticker: Sticker) => {
    catalog.addRecent(sticker);
    onSelect(sticker);
    close();
  };

  const toggleFavorite = (sticker: Sticker) => {
    const favorite = catalog.isFavorite(sticker);
    catalog.toggleFavorite(sticker);
    showAppDialog({
      title: favorite ? "Removed from favorites" : "Added to favorites",
      message: `${sticker.name} is ${favorite ? "no longer" : "now"} in your favorites.`,
      tone: "success",
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.modal}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close stickers" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Stickers</Text>
              <Text style={styles.subtitle}>
                {catalog.installedPacks.length} pack{catalog.installedPacks.length === 1 ? "" : "s"} installed
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setSearchOpen((value) => {
                  if (value) setQuery("");
                  return !value;
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Search stickers"
              style={styles.headerButton}
            >
              <Ionicons name={searchOpen ? "close" : "search"} size={19} color={COLORS.textPrimary} />
            </Pressable>
            <Pressable
              onPress={closeAndStore}
              accessibilityRole="button"
              accessibilityLabel="Browse sticker store"
              style={[styles.headerButton, styles.storeButton]}
            >
              <Ionicons name="add" size={20} color={COLORS.textWhite} />
            </Pressable>
          </View>

          {searchOpen ? (
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={17} color={COLORS.textMuted} />
              <TextInput
                ref={input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search installed stickers"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              <Tab
                label="Recent"
                icon="time-outline"
                active={effectiveTab === "recents"}
                onPress={() => setTab("recents")}
              />
              <Tab
                label="Favorites"
                icon="heart-outline"
                active={effectiveTab === "favorites"}
                onPress={() => setTab("favorites")}
              />
              {catalog.installedPacks.map((pack) => (
                <Pressable
                  key={pack.id}
                  onPress={() => setTab(pack.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: effectiveTab === pack.id }}
                  style={[styles.packTab, effectiveTab === pack.id && styles.packTabActive]}
                >
                  {pack.cover ? (
                    <Image source={pack.cover} style={styles.packCover} contentFit="contain" />
                  ) : pack.coverUrl ? (
                    <Image source={{ uri: pack.coverUrl }} style={styles.packCover} contentFit="contain" />
                  ) : (
                    <Ionicons name="happy-outline" size={22} color={COLORS.primary} />
                  )}
                  <Text style={[styles.packName, effectiveTab === pack.id && styles.packNameActive]} numberOfLines={1}>
                    {pack.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {!catalog.ready || catalog.remoteLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading stickers…</Text>
            </View>
          ) : !catalog.installedPacks.length ? (
            <View style={styles.empty}>
              <Ionicons name="albums-outline" size={30} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No sticker packs</Text>
              <Text style={styles.emptyText}>Browse the store to add a pack.</Text>
              <Pressable onPress={closeAndStore} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Open sticker store</Text>
              </Pressable>
            </View>
          ) : !stickers.length ? (
            <View style={styles.empty}>
              <Ionicons
                name={query ? "search-outline" : effectiveTab === "favorites" ? "heart-outline" : "time-outline"}
                size={30}
                color={COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {query ? "No stickers match" : effectiveTab === "favorites" ? "No favorites yet" : "No recent stickers"}
              </Text>
              <Text style={styles.emptyText}>
                {query
                  ? "Try another word or switch packs."
                  : effectiveTab === "favorites"
                    ? "Long-press a sticker to add it to favorites."
                    : "Send a sticker and it will show up here."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={stickers}
              keyExtractor={(item) => `${item.packId}:${item.id}`}
              numColumns={COLUMNS}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={styles.gridRow}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const favorite = catalog.isFavorite(item);
                return (
                  <Pressable
                    onPress={() => choose(item)}
                    onLongPress={() => toggleFavorite(item)}
                    delayLongPress={320}
                    accessibilityRole="button"
                    accessibilityLabel={`Send ${item.name} sticker${item.animated ? ", animated" : ""}`}
                    style={({ pressed }) => [
                      styles.tile,
                      { width: tile, height: tile },
                      pressed && styles.tilePressed,
                    ]}
                  >
                    <StickerImage sticker={item} size={tile - 12} />
                    {favorite ? (
                      <View style={styles.favoriteBadge}>
                        <Ionicons name="heart" size={9} color={COLORS.textWhite} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function Tab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.specialTab, active && styles.specialTabActive]}
    >
      <Ionicons name={icon} size={16} color={active ? COLORS.primaryDark : COLORS.textMuted} />
      <Text style={[styles.specialLabel, active && styles.specialLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(20,18,36,0.36)" },
  sheet: {
    maxHeight: "68%",
    minHeight: 380,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: COLORS.bgWhite,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    ...SHADOWS.lg,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E4E1EE",
    marginBottom: SPACING.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl5, fontWeight: "800" },
  subtitle: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgInput,
  },
  storeButton: { backgroundColor: COLORS.primary },
  searchBox: {
    marginTop: SPACING.md,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 14,
    backgroundColor: COLORS.bgInput,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl },
  tabs: { gap: SPACING.sm, paddingVertical: SPACING.md, paddingRight: SPACING.xl },
  specialTab: {
    minWidth: 78,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 16,
    backgroundColor: COLORS.bgInput,
  },
  specialTabActive: { backgroundColor: COLORS.primaryGhost },
  specialLabel: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm, fontWeight: "600" },
  specialLabelActive: { color: COLORS.primaryDark },
  packTab: {
    width: 72,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EFEDF6",
  },
  packTabActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryGhost },
  packCover: { width: 30, height: 30 },
  packName: { maxWidth: 64, color: COLORS.textMuted, fontSize: 9, fontWeight: "600" },
  packNameActive: { color: COLORS.primaryDark },
  grid: { paddingVertical: SPACING.sm, paddingBottom: SPACING.xl },
  gridRow: { gap: SPACING.md, marginBottom: SPACING.md },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.md,
  },
  tilePressed: { backgroundColor: COLORS.primaryGhost },
  favoriteBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  loadingText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.sm },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "700" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
  emptyButton: { marginTop: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: 14, backgroundColor: COLORS.primary },
  emptyButtonText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.lg, fontWeight: "700" },
});
