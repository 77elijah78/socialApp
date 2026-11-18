import AsyncStorage from "@react-native-async-storage/async-storage";

export const AUTO_DOWNLOAD_STORAGE_KEY = "circle.autoDownload.v1";

export type AutoDownloadNetwork = "wifi" | "mobile" | "roaming";
export type AutoDownloadCategory =
  | "photos"
  | "videos"
  | "voice"
  | "music"
  | "documents";

export interface AutoDownloadSettings {
  networks: Record<AutoDownloadNetwork, boolean>;
  media: Record<AutoDownloadCategory, boolean>;
}

/** Conservative defaults: photos and voice notes arrive on known networks,
 * while expensive video/music/document transfers remain an explicit action. */
export const DEFAULT_AUTO_DOWNLOAD_SETTINGS: AutoDownloadSettings = {
  networks: { wifi: true, mobile: true, roaming: false },
  media: {
    photos: true,
    videos: false,
    voice: true,
    music: false,
    documents: false,
  },
};

/** Automatic transfers are bounded per category. Manual taps always bypass
 * these limits. Values are bytes. */
export const AUTO_DOWNLOAD_SIZE_LIMITS: Record<AutoDownloadCategory, number> = {
  photos: 10 * 1024 * 1024,
  videos: 100 * 1024 * 1024,
  voice: 5 * 1024 * 1024,
  music: 20 * 1024 * 1024,
  documents: 25 * 1024 * 1024,
};

export type NetworkCharge = "wifi" | "mobile" | "roaming" | "other" | "offline";

type Listener = () => void;

function clone(value: AutoDownloadSettings): AutoDownloadSettings {
  return {
    networks: { ...value.networks },
    media: { ...value.media },
  };
}

function normalize(raw: unknown): AutoDownloadSettings {
  if (!raw || typeof raw !== "object") return clone(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
  const input = raw as Partial<AutoDownloadSettings>;
  const networks = { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS.networks };
  const media = { ...DEFAULT_AUTO_DOWNLOAD_SETTINGS.media };
  for (const key of Object.keys(networks) as AutoDownloadNetwork[])
    if (typeof input.networks?.[key] === "boolean")
      networks[key] = input.networks[key]!;
  for (const key of Object.keys(media) as AutoDownloadCategory[])
    if (typeof input.media?.[key] === "boolean") media[key] = input.media[key]!;
  return { networks, media };
}

class AutoDownloadSettingsStore {
  private value = clone(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
  private listeners = new Set<Listener>();
  private hydrated = false;
  private hydrating: Promise<void> | null = null;

  getSnapshot = () => this.value;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    void this.hydrate();
    return () => {
      this.listeners.delete(listener);
    };
  };

  hydrate() {
    if (this.hydrated) return Promise.resolve();
    if (this.hydrating) return this.hydrating;
    this.hydrating = (async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTO_DOWNLOAD_STORAGE_KEY);
        if (stored) {
          this.value = normalize(JSON.parse(stored));
          this.emit();
        }
      } catch {
        /* First launch, corrupt storage or a read-only FS keeps defaults. */
      } finally {
        this.hydrated = true;
        this.hydrating = null;
      }
    })();
    return this.hydrating;
  }

  private emit() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* one broken subscriber must not block the rest */
      }
    }
  }

  private persist() {
    void AsyncStorage.setItem(
      AUTO_DOWNLOAD_STORAGE_KEY,
      JSON.stringify(this.value),
    ).catch(() => {
      /* Settings remain active for this session and retry on the next change. */
    });
  }

  setNetwork(network: AutoDownloadNetwork, enabled: boolean) {
    this.value = {
      ...this.value,
      networks: { ...this.value.networks, [network]: enabled },
    };
    this.emit();
    this.persist();
  }

  setMedia(category: AutoDownloadCategory, enabled: boolean) {
    this.value = {
      ...this.value,
      media: { ...this.value.media, [category]: enabled },
    };
    this.emit();
    this.persist();
  }

  reset() {
    this.value = clone(DEFAULT_AUTO_DOWNLOAD_SETTINGS);
    this.emit();
    this.persist();
  }
}

export const autoDownloadSettings = new AutoDownloadSettingsStore();

export function networkChargeFromStatus(status: {
  type?: string | null;
  isConnected?: boolean;
  isRoaming?: boolean;
}): NetworkCharge {
  if (status.isConnected === false || status.type === "NONE") return "offline";
  const type = (status.type ?? "").toUpperCase();
  // Until the first native update arrives we do not know whether the socket is
  // expensive, so automatic downloads wait instead of guessing Wi-Fi.
  if (!type || type === "UNKNOWN") return "offline";
  if (type === "CELLULAR") return status.isRoaming ? "roaming" : "mobile";
  if (type === "WIFI" || type === "ETHERNET") return "wifi";
  if (type === "NONE") return "offline";
  return "other";
}

export function categoryForMedia(input: {
  type: string;
  mimeType?: string | null;
  fileName?: string | null;
}): AutoDownloadCategory | null {
  const type = input.type.toUpperCase();
  if (type === "IMAGE" || input.mimeType?.startsWith("image/")) return "photos";
  if (type === "VIDEO" || input.mimeType?.startsWith("video/")) return "videos";
  if (type === "DOCUMENT") return "documents";
  if (type === "AUDIO" || input.mimeType?.startsWith("audio/")) {
    // A named audio attachment came from the file picker (music). Recorded
    // voice notes have no attachment filename.
    return input.fileName ? "music" : "voice";
  }
  return null;
}

/** Pure decision used by both the receive path and settings previews/tests. */
export function shouldAutoDownload(input: {
  settings: AutoDownloadSettings;
  category: AutoDownloadCategory | null;
  size?: number | null;
  network: NetworkCharge;
}): boolean {
  const { settings, category, size, network } = input;
  if (!category || network === "offline") return false;
  if (network === "roaming" && !settings.networks.roaming) return false;
  if (network === "mobile" && !settings.networks.mobile) return false;
  if ((network === "wifi" || network === "other") && !settings.networks.wifi)
    return false;
  if (!settings.media[category]) return false;
  if (typeof size === "number" && size > AUTO_DOWNLOAD_SIZE_LIMITS[category])
    return false;
  return true;
}

export function formatAutoDownloadLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
