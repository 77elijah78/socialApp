import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";

import {
  BUILTIN_PACKS,
  encodeStickerMarker,
  findBuiltinSticker,
  type Sticker,
  type StickerPack,
} from "@/constants/stickers";
import { api, ApiError } from "./api";

interface RemoteStickerDTO {
  id?: string;
  stickerId?: string;
  name?: string;
  tags?: string[];
  url?: string;
  mediaUrl?: string;
  width?: number;
  height?: number;
  animated?: boolean;
}

interface RemotePackDTO {
  id?: string;
  name?: string;
  description?: string;
  coverUrl?: string;
  stickers?: RemoteStickerDTO[];
}

interface StickerPrefs {
  installed: string[];
  favorites: string[];
  recents: string[];
}

const BUILTIN_IDS = BUILTIN_PACKS.map((pack) => pack.id);
const DEFAULT_PREFS: StickerPrefs = {
  installed: [...BUILTIN_IDS],
  favorites: [],
  recents: [],
};

const storageKey = (accountId: string, suffix: string) =>
  `stickers:${accountId || "anonymous"}:${suffix}`;

export const stickerKey = (packId: string, stickerId: string) =>
  `${packId}:${stickerId}`;

class StickerPreferences {
  private accountId = "";
  private prefs: StickerPrefs = { ...DEFAULT_PREFS };
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;

  get snapshot(): StickerPrefs {
    return this.prefs;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hydrate(accountId: string): Promise<void> {
    if (this.accountId === accountId && this.loading) return this.loading;
    this.accountId = accountId;
    this.prefs = { ...DEFAULT_PREFS };
    this.emit();
    this.loading = (async () => {
      try {
        const [installed, favorites, recents] = await Promise.all([
          AsyncStorage.getItem(storageKey(accountId, "installed")),
          AsyncStorage.getItem(storageKey(accountId, "favorites")),
          AsyncStorage.getItem(storageKey(accountId, "recents")),
        ]);
        this.prefs = {
          installed: installed ? safeArray(installed) : [...BUILTIN_IDS],
          favorites: favorites ? safeArray(favorites) : [],
          recents: recents ? safeArray(recents) : [],
        };
      } catch {
        this.prefs = { ...DEFAULT_PREFS };
      } finally {
        this.emit();
      }
    })();
    return this.loading;
  }

  async setInstalled(packId: string, installed: boolean) {
    const current = new Set(this.prefs.installed);
    if (installed) current.add(packId);
    else current.delete(packId);
    this.prefs = { ...this.prefs, installed: [...current] };
    this.emit();
    await this.persist("installed", this.prefs.installed);
  }

  async toggleFavorite(packId: string, stickerId: string) {
    const key = stickerKey(packId, stickerId);
    const current = new Set(this.prefs.favorites);
    if (current.has(key)) current.delete(key);
    else current.add(key);
    this.prefs = { ...this.prefs, favorites: [...current] };
    this.emit();
    await this.persist("favorites", this.prefs.favorites);
  }

  async recordRecent(packId: string, stickerId: string) {
    const key = stickerKey(packId, stickerId);
    this.prefs = {
      ...this.prefs,
      recents: [key, ...this.prefs.recents.filter((item) => item !== key)].slice(0, 24),
    };
    this.emit();
    await this.persist("recents", this.prefs.recents);
  }

  private persist(suffix: string, value: string[]) {
    if (!this.accountId) return Promise.resolve();
    return AsyncStorage.setItem(storageKey(this.accountId, suffix), JSON.stringify(value)).catch(
      () => undefined,
    );
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

function safeArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export const stickerPreferences = new StickerPreferences();

function normalizeRemotePack(dto: RemotePackDTO): StickerPack | null {
  if (!dto?.id || !dto.name || !Array.isArray(dto.stickers)) return null;
  const stickers: Sticker[] = dto.stickers.flatMap((raw) => {
    const id = raw.id ?? raw.stickerId;
    const url = raw.url ?? raw.mediaUrl;
    if (!id || !url || !isSupportedStickerUri(url)) return [];
    return [
      {
        id,
        packId: dto.id!,
        name: raw.name ?? id,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        url,
        width: raw.width ?? 256,
        height: raw.height ?? 256,
        animated: Boolean(raw.animated),
      },
    ];
  });
  if (!stickers.length) return null;
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? "Stickerpack",
    coverUrl: dto.coverUrl ?? stickers[0].url,
    stickers,
    source: "remote",
  };
}

/** Remote catalog is additive: unreachable/undeployed endpoint leaves the
 * bundled packs fully usable and reports availability separately. */
export async function fetchRemoteStickerPacks(query = ""): Promise<{
  packs: StickerPack[];
  available: boolean;
}> {
  try {
    const response = await api.get<{ data: unknown }>(
      `/stickers/packs?query=${encodeURIComponent(query.trim())}`,
    );
    const payload = response.data;
    let raw: RemotePackDTO[] = [];
    if (Array.isArray(payload)) raw = payload as RemotePackDTO[];
    else if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      const candidate = record.packs ?? record.items ?? record.results;
      if (Array.isArray(candidate)) raw = candidate as RemotePackDTO[];
    }
    return {
      packs: raw
        .map(normalizeRemotePack)
        .filter((pack): pack is StickerPack => Boolean(pack)),
      available: true,
    };
  } catch (error) {
    return {
      packs: [],
      available: false,
      ...(error instanceof ApiError ? {} : {}),
    };
  }
}

/** Telegram's .tgs (Lottie JSON) and .webm (VP9 alpha) need extra runtimes that
 * this app does not ship. WebP/GIF/APNG work in expo-image on both platforms. */
export function isSupportedStickerUri(uri: string) {
  return !/\.(tgs|webm)(?:[?#]|$)/i.test(uri);
}

/** Expo-image renders WebP/GIF/APNG; the catalog never assumes Telegram's
 * .tgs/.webm formats. Preserve the real MIME for server-side validation. */
export function stickerMimeType(uri: string) {
  const path = uri.split("?")[0].split("#")[0].toLowerCase();
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".png") || path.endsWith(".apng")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/webp";
}

/** Resolve a bundled asset to a local file URI suitable for the existing upload
 * pipeline. Remote stickers are sent by URL and never downloaded first. */
export async function stickerMediaForSend(
  sticker: Sticker,
): Promise<{ mediaUri: string; mimeType: string } | null> {
  if (sticker.url) {
    if (!isSupportedStickerUri(sticker.url)) return null;
    return { mediaUri: sticker.url, mimeType: stickerMimeType(sticker.url) };
  }
  if (!sticker.asset) return null;
  try {
    const asset = Asset.fromModule(sticker.asset as number);
    if (!asset.downloaded) await asset.downloadAsync();
    const mediaUri = asset.localUri ?? asset.uri;
    return mediaUri ? { mediaUri, mimeType: "image/webp" } : null;
  } catch {
    return null;
  }
}

export function stickerAppearsInSearch(sticker: Sticker, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    sticker.name.toLowerCase().includes(normalized) ||
    sticker.id.toLowerCase().includes(normalized) ||
    sticker.tags.some((tag) => tag.toLowerCase().includes(normalized))
  );
}

export { BUILTIN_PACKS, encodeStickerMarker, findBuiltinSticker };
