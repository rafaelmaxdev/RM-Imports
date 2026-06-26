/**
 * Client-side caching utility with stale-while-revalidate pattern.
 * Caches API responses in localStorage to reduce Supabase bandwidth.
 */

const CACHE_PREFIX = "rm_cache_";
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** Retrieve cached data. Returns null if not found or expired beyond stale period. */
export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return entry.data;
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[cache] getCached:", err);
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[cache] setCache:", err);
  }
}

export function isCacheStale(key: string, ttl = DEFAULT_TTL): boolean {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return true;
    const entry: CacheEntry<unknown> = JSON.parse(raw);
    return Date.now() - entry.timestamp > ttl;
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[cache] isCacheStale:", err);
    return true;
  }
}

export function clearCache(key?: string): void {
  try {
    if (key) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } else {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[cache] clearCache:", err);
  }
}
