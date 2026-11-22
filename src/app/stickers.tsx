import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import PageHeader from "@/components/common/PageHeader";
import StickerImage from "@/components/stickers/StickerImage";
import { useDebounce } from "@/hooks/useDebounce";
import { useStickerCatalog } from "@/hooks/useStickers";
import { useAppSelector } from "@/store/hooks";
import type { StickerPack } from "@/constants/stickers";
import {
  BORDER_RADIUS,
  COLORS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from "@/constants/theme";

function PackCard({
  pack,
  installed,
  onToggle,
  onFavorite,
  isFavorite,
}: {
  pack: StickerPack;
  installed: boolean;
  onToggle: () => void;
  onFavorite: (stickerId: string) => void;
  isFavorite: (stickerId: string) => boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.coverWrap}>
          {pack.cover ? (
            <Image source={pack.cover} style={styles.cover} contentFit="contain" />
          ) : pack.coverUrl ? (
            <Image source={{ uri: pack.coverUrl }} style={styles.cover} contentFit="contain" />
          ) : (
            <Ionicons name="happy-outline" size={26} color={COLORS.primary} />
          )}
        </View>
        <View style={styles.cardCopy}>
          <View style={styles.nameLine}>
            <Text style={styles.packName} numberOfLines={1}>{pack.name}</Text>
            {pack.source === "builtin" ? (
              <View style={styles.builtinBadge}><Text style={styles.builtinText}>BUILT-IN</Text></View>
            ) : null}
          </View>
          <Text style={styles.packDescription} numberOfLines={2}>{pack.description}</Text>
          <Text style={styles.packCount}>{pack.stickers.length} sticker{pack.stickers.length === 1 ? "" : "s"}</Text>
        </View>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={installed ? `Remove ${pack.name}` : `Add ${pack.name}`}
          style={[styles.toggle, installed && styles.toggleInstalled]}
        >
          <Ionicons name={installed ? "checkmark" : "add"} size={15} color={installed ? COLORS.primaryDark : COLORS.textWhite} />
          <Text style={[styles.toggleText, installed && styles.toggleTextInstalled]}>
            {installed ? "Added" : "Add"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.preview}>
        {pack.stickers.slice(0, 6).map((sticker) => (
          <Pressable
            key={sticker.id}
            onLongPress={() => onFavorite(sticker.id)}
            delayLongPress={280}
            accessibilityRole="button"
            accessibilityLabel={`${sticker.name} sticker`}
            style={styles.previewTile}
          >
            <StickerImage sticker={sticker} size={46} />
            {isFavorite(sticker.id) ? (
              <View style={styles.favorite}>
                <Ionicons name="heart" size={8} color={COLORS.textWhite} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function StickerStoreScreen() {
  const userId = useAppSelector((state) => state.auth.user?.id);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query.trim(), 300);
  const catalog = useStickerCatalog(userId, debounced);

  const installedCount = catalog.installedIds.length;
  const filtered = useMemo(() => {
    const normalized = debounced.toLowerCase();
    if (!normalized) return catalog.packs;
    return catalog.packs.filter(
      (pack) =>
        pack.name.toLowerCase().includes(normalized) ||
        pack.description.toLowerCase().includes(normalized) ||
        pack.stickers.some(
          (sticker) =>
            sticker.name.toLowerCase().includes(normalized) ||
            sticker.tags.some((tag) => tag.toLowerCase().includes(normalized)),
        ),
    );
  }, [catalog.packs, debounced]);

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Sticker store"
        subtitle={`${installedCount} pack${installedCount === 1 ? "" : "s"} installed`}
      />
      <FlatList
        data={filtered}
        keyExtractor={(pack) => pack.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="happy" size={26} color={COLORS.primary} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Say it with a sticker</Text>
                <Text style={styles.heroText}>
                  Long-press any sticker to favorite it. Added packs appear in every chat, group and channel.
                </Text>
              </View>
            </View>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search packs and stickers"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                style={styles.searchInput}
                returnKeyType="search"
              />
              {catalog.remoteLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
            </View>
            {!catalog.remoteAvailable ? (
              <View style={styles.offlineNote}>
                <Ionicons name="cloud-offline-outline" size={17} color={COLORS.accentBlue} />
                <Text style={styles.offlineText}>
                  Online packs are unavailable right now. Bundled packs work offline.
                </Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <PackCard
            pack={item}
            installed={catalog.isInstalled(item.id)}
            onToggle={() => catalog.toggleInstalled(item.id)}
            onFavorite={(stickerId) => {
              const sticker = item.stickers.find((candidate) => candidate.id === stickerId);
              if (sticker) catalog.toggleFavorite(sticker);
            }}
            isFavorite={(stickerId) =>
              catalog.favoriteKeys.has(`${item.id}:${stickerId}`)
            }
          />
        )}
        ListEmptyComponent={
          catalog.remoteLoading && !catalog.packs.length ? (
            <View style={styles.empty}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.emptyText}>Loading sticker packs…</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={30} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No packs found</Text>
              <Text style={styles.emptyText}>Try another search term.</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgMain },
  content: { padding: SPACING.xl, paddingBottom: SPACING.xxxxxl },
  gap: { height: SPACING.md },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: 22,
    backgroundColor: COLORS.primaryGhost,
    borderWidth: 1,
    borderColor: COLORS.primaryGhostBorder,
    marginBottom: SPACING.md,
  },
  heroIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bgWhite },
  heroCopy: { flex: 1, minWidth: 0 },
  heroTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "800" },
  heroText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16, marginTop: 2 },
  searchBox: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    marginBottom: SPACING.md,
  },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl },
  offlineNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 14,
    backgroundColor: "#EAF2FF",
    marginBottom: SPACING.md,
  },
  offlineText: { flex: 1, color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 16 },
  card: {
    padding: SPACING.lg,
    borderRadius: 22,
    backgroundColor: COLORS.bgWhite,
    borderWidth: 1,
    borderColor: "#ECEAF4",
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  coverWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgInput,
  },
  cover: { width: 44, height: 44 },
  cardCopy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  packName: { flexShrink: 1, color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "700" },
  builtinBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: COLORS.primaryGhost },
  builtinText: { color: COLORS.primaryDark, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  packDescription: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, lineHeight: 15, marginTop: 1 },
  packCount: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.fontSize.sm, marginTop: 2 },
  toggle: {
    minWidth: 66,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  toggleInstalled: { backgroundColor: COLORS.primaryGhost },
  toggleText: { color: COLORS.textWhite, fontSize: TYPOGRAPHY.fontSize.md, fontWeight: "700" },
  toggleTextInstalled: { color: COLORS.primaryDark },
  preview: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  previewTile: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgCard,
  },
  favorite: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  empty: { alignItems: "center", paddingVertical: SPACING.xxxxl, gap: SPACING.sm },
  emptyTitle: { color: COLORS.textPrimary, fontSize: TYPOGRAPHY.fontSize.xl, fontWeight: "700" },
  emptyText: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.fontSize.md, textAlign: "center" },
});
