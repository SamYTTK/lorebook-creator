interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheItem<unknown>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 5 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | undefined {
    const item = this.store.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return item.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  status(): { size: number; keys: string[] } {
    const now = Date.now();
    const keys: string[] = [];
    for (const [k, v] of this.store) {
      if (now <= v.expiresAt) keys.push(k);
    }
    return { size: keys.length, keys };
  }
}

export const cache = new TtlCache();
export const modelListCache = new TtlCache(10 * 60 * 1000);
