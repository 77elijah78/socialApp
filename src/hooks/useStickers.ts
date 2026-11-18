import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BUILTIN_PACKS,
  findBuiltinSticker,
  stickerKey,
  stickerPreferences,
  fetchRemoteStickerPacks,
} from "@/services/StickerService";
import type { Sticker, StickerPack } from "@/constants/stickers";

export function useStickerCatalog(userId?: string, query = "") {
  const [version, setVersion] = useState(0);
  const account = userId ?? "";
  const [readyAccount, setReadyAccount] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<{
    query: string;
    packs: StickerPack[];
    available: boolean;
    loading: boolean;
  }>({ query: "", packs: [], available: true, loading: true });

  useEffect(() => {
    let active = true;
    void stickerPreferences.hydrate(account).finally(() => {
      if (active) setReadyAccount(account);
    });
    const unsubscribe = stickerPreferences.subscribe(() => setVersion((value) => value + 1));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [account]);

  useEffect(() => {
    let active = true;
    void fetchRemoteStickerPacks(query).then((result) => {
      if (!active) return;
      setRemoteState({
        query,
        packs: result.packs,
        available: result.available,
        loading: false,
      });
    });
    return () => {
      active = false;
    };
  }, [query]);

  const ready = readyAccount === account;
  const remoteCurrent = remoteState.query === query;
  const remote = useMemo(
    () => (remoteCurrent ? remoteState.packs : []),
    [remoteCurrent, remoteState.packs],
  );
  const remoteAvailable = remoteCurrent ? remoteState.available : true;
  const remoteLoading = !remoteCurrent || remoteState.loading;
  const prefs = stickerPreferences.snapshot;
  const allPacks = useMemo(() => [...BUILTIN_PACKS, ...remote], [remote]);
  const packsById = useMemo(
    () => new Map(allPacks.map((pack) => [pack.id, pack])),
    [allPacks],
  );

  const installedPacks = useMemo(
    () => prefs.installed.flatMap((id) => (packsById.get(id) ? [packsById.get(id)!] : [])),
    [packsById, prefs.installed],
  );

  const stickers = useMemo(
    () => allPacks.flatMap((pack) => pack.stickers),
    [allPacks],
  );

  const favorites = useMemo(
    () => prefs.favorites.flatMap((key) => {
      const [packId, stickerId] = key.split(":");
      const sticker = stickers.find((item) => item.packId === packId && item.id === stickerId);
      return sticker ? [sticker] : [];
    }),
    [prefs.favorites, stickers],
  );

  const recents = useMemo(
    () => prefs.recents.flatMap((key) => {
      const [packId, stickerId] = key.split(":");
      const sticker = stickers.find((item) => item.packId === packId && item.id === stickerId);
      return sticker ? [sticker] : [];
    }),
    [prefs.recents, stickers],
  );

  const toggleInstalled = useCallback(
    (packId: string) => {
      const installed = prefs.installed.includes(packId);
      void stickerPreferences.setInstalled(packId, !installed);
    },
    [prefs.installed],
  );

  const toggleFavorite = useCallback((sticker: Sticker) => {
    void stickerPreferences.toggleFavorite(sticker.packId, sticker.id);
  }, []);

  const addRecent = useCallback((sticker: Sticker) => {
    void stickerPreferences.recordRecent(sticker.packId, sticker.id);
  }, []);

  return {
    ready,
    packs: allPacks,
    installedPacks,
    favorites,
    recents,
    installedIds: prefs.installed,
    favoriteKeys: new Set(prefs.favorites),
    isInstalled: (packId: string) => prefs.installed.includes(packId),
    isFavorite: (sticker: Sticker) => prefs.favorites.includes(stickerKey(sticker.packId, sticker.id)),
    toggleInstalled,
    toggleFavorite,
    addRecent,
    findSticker: (packId: string, stickerId: string) =>
      findBuiltinSticker(packId, stickerId) ??
      stickers.find((item) => item.packId === packId && item.id === stickerId),
    remoteAvailable,
    remoteLoading,
    version,
  };
}
