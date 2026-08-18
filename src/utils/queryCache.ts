import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "cache:";

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data as T;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, data: T, ttlMs = 5 * 60_000): Promise<void> {
  try {
    const entry = {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
}

export async function removeCached(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // ignore
  }
}
