/**
 * Advanced caching layer for API responses
 * Features: LRU eviction, TTL support, request deduplication
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

interface CacheOptions {
  ttl?: number; // Time to live in ms, default 5 minutes
  maxSize?: number; // Max number of entries, default 100
}

/**
 * LRU Cache implementation with TTL support and request deduplication
 */
export class Cache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private pendingRequests = new Map<string, Promise<T>>();
  private maxSize: number;
  private defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.defaultTTL = options.ttl ?? 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Get a value from cache, or execute fetcher if not found/expired
   * Deduplicates simultaneous requests to the same key
   */
  async get(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const now = Date.now();
    const entry = this.entries.get(key);

    // Return cached value if not expired
    if (entry && now - entry.timestamp < entry.ttl) {
      this.updateAccessOrder(key);
      return entry.data;
    }

    // Return pending request if one is already in flight (deduplication)
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }

    // Fetch new data
    const promise = fetcher();
    this.pendingRequests.set(key, promise);

    try {
      const data = await promise;
      this.set(key, data, ttl);
      return data;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Set a value in cache
   */
  set(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    };

    // If key exists, remove it from access order first
    if (this.entries.has(key)) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
    }

    this.entries.set(key, entry);
    this.accessOrder.push(key);

    // Evict oldest entry if cache is full
    if (this.entries.size > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    const isExpired = Date.now() - entry.timestamp >= entry.ttl;
    return !isExpired;
  }

  /**
   * Remove a specific key from cache
   */
  delete(key: string): boolean {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return this.entries.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.entries.clear();
    this.accessOrder = [];
    this.pendingRequests.clear();
  }

  /**
   * Get cache stats for monitoring
   */
  stats() {
    const expiredCount = Array.from(this.entries.entries()).filter(
      ([_, entry]) => Date.now() - entry.timestamp >= entry.ttl
    ).length;

    return {
      size: this.entries.size,
      maxSize: this.maxSize,
      expired: expiredCount,
      pendingRequests: this.pendingRequests.size,
    };
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }
}

/**
 * Global cache instances
 */
export const conversationCache = new Cache<any>({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 50,
});

export const messageCache = new Cache<any>({
  ttl: 10 * 60 * 1000, // 10 minutes
  maxSize: 100,
});

export const personaCache = new Cache<any>({
  ttl: 60 * 60 * 1000, // 1 hour
  maxSize: 20,
});

/**
 * Generate a cache key from parameters
 */
export function getCacheKey(...parts: (string | number | boolean)[]): string {
  return parts.map((p) => String(p)).join("|");
}

/**
 * Invalidate cache when mutations occur
 */
export function invalidateConversationCache(userEmail?: string): void {
  if (userEmail) {
    // Clear all conversation cache for now
    // (In production, would track per-user entries more efficiently)
    conversationCache.clear();
  } else {
    // Clear all conversation cache
    conversationCache.clear();
  }
}

/**
 * Batch multiple cache operations
 */
export async function batchCacheGet<T>(
  requests: { key: string; fetcher: () => Promise<T>; ttl?: number }[],
  cache: Cache<T>
): Promise<T[]> {
  return Promise.all(
    requests.map((req) => cache.get(req.key, req.fetcher, req.ttl))
  );
}
