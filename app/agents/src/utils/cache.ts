import { createHash } from "crypto";
import { getLogger } from "./logger";
import pino from "pino";

// ═══════════════════════════════════════════════════════════════════════════
// ANSI COLOR CODES FOR CACHE LOGGING
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  white: "\x1b[37m",

  // Background
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgRed: "\x1b[41m",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// CACHE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  size: number; // Approximate size in bytes
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  entries: number;
  hitRate: number;
  avgAccessCount: number;
  oldestEntryAge: number;
  newestEntryAge: number;
}

export interface CacheConfig {
  maxEntries: number;
  maxSizeBytes: number;
  ttlMs: number;
  name: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LRU CACHE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(private readonly config: CacheConfig) {}

  /**
   * Generate a cache key from input object.
   */
  static generateKey(input: Record<string, unknown>): string {
    const normalized = JSON.stringify(input, Object.keys(input).sort());
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  }

  /**
   * Estimate the size of a value in bytes.
   */
  private estimateSize(value: T): number {
    try {
      return JSON.stringify(value).length * 2; // UTF-16 chars
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Get the current total cache size in bytes.
   */
  private getTotalSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Evict oldest entries to make room.
   */
  private evictIfNeeded(requiredSize: number): void {
    // Evict by count
    while (this.cache.size >= this.config.maxEntries) {
      const oldest = this.findOldestEntry();
      if (oldest) {
        this.cache.delete(oldest);
        this.stats.evictions++;
      } else {
        break;
      }
    }

    // Evict by size
    while (this.getTotalSize() + requiredSize > this.config.maxSizeBytes && this.cache.size > 0) {
      const oldest = this.findOldestEntry();
      if (oldest) {
        this.cache.delete(oldest);
        this.stats.evictions++;
      } else {
        break;
      }
    }
  }

  /**
   * Find the least recently accessed entry.
   */
  private findOldestEntry(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Check if an entry is expired.
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.createdAt > this.config.ttlMs;
  }

  /**
   * Get a value from cache.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Update access stats
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Set a value in cache.
   */
  set(key: string, value: T): void {
    const size = this.estimateSize(value);
    this.evictIfNeeded(size);

    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      size,
    });
  }

  /**
   * Check if key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const now = Date.now();
    let totalAccessCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
      const age = now - entry.createdAt;
      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
    }

    const totalOps = this.stats.hits + this.stats.misses;
    const hitRate = totalOps > 0 ? this.stats.hits / totalOps : 0;
    const avgAccessCount = this.cache.size > 0 ? totalAccessCount / this.cache.size : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.getTotalSize(),
      maxSize: this.config.maxSizeBytes,
      entries: this.cache.size,
      hitRate,
      avgAccessCount,
      oldestEntryAge: oldestAge,
      newestEntryAge: this.cache.size > 0 ? newestAge : 0,
    };
  }

  /**
   * Get the cache name.
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Cleanup expired entries.
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MANAGER - SINGLETON FOR ALL TOOL CACHES
// ═══════════════════════════════════════════════════════════════════════════

export interface ToolCacheInput {
  toolName: string;
  input: Record<string, unknown>;
}

class CacheManager {
  private caches = new Map<string, LRUCache<unknown>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Default configs per cache type
  private readonly defaultConfigs: Record<string, CacheConfig> = {
    semantic_search: {
      name: "semantic_search",
      maxEntries: 100,
      maxSizeBytes: 10 * 1024 * 1024, // 10MB
      ttlMs: 5 * 60 * 1000, // 5 minutes
    },
    hybrid_search: {
      name: "hybrid_search",
      maxEntries: 100,
      maxSizeBytes: 10 * 1024 * 1024, // 10MB
      ttlMs: 5 * 60 * 1000, // 5 minutes
    },
    sql_execute: {
      name: "sql_execute",
      maxEntries: 200,
      maxSizeBytes: 20 * 1024 * 1024, // 20MB
      ttlMs: 2 * 60 * 1000, // 2 minutes (SQL results may change more frequently)
    },
  };

  constructor() {
    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Get or create a cache for a specific tool.
   */
  getCache<T>(toolName: string): LRUCache<T> {
    let cache = this.caches.get(toolName);
    if (!cache) {
      const config = this.defaultConfigs[toolName] ?? {
        name: toolName,
        maxEntries: 50,
        maxSizeBytes: 5 * 1024 * 1024,
        ttlMs: 3 * 60 * 1000,
      };
      cache = new LRUCache<T>(config);
      this.caches.set(toolName, cache as LRUCache<unknown>);
    }
    return cache as LRUCache<T>;
  }

  /**
   * Get cached result for a tool input.
   */
  get<T>(toolName: string, input: Record<string, unknown>): T | null {
    const cache = this.getCache<T>(toolName);
    const key = LRUCache.generateKey(input);
    return cache.get(key);
  }

  /**
   * Cache a tool result.
   */
  set<T>(toolName: string, input: Record<string, unknown>, value: T): void {
    const cache = this.getCache<T>(toolName);
    const key = LRUCache.generateKey(input);
    cache.set(key, value);
  }

  /**
   * Check if a tool input is cached.
   */
  has(toolName: string, input: Record<string, unknown>): boolean {
    const cache = this.getCache(toolName);
    const key = LRUCache.generateKey(input);
    return cache.has(key);
  }

  /**
   * Get all cache statistics.
   */
  getAllStats(): Map<string, CacheStats> {
    const allStats = new Map<string, CacheStats>();
    for (const [name, cache] of this.caches.entries()) {
      allStats.set(name, cache.getStats());
    }
    return allStats;
  }

  /**
   * Clear all caches.
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Start periodic cleanup of expired entries.
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      for (const cache of this.caches.values()) {
        cache.cleanup();
      }
    }, 60 * 1000); // Every minute

    // Don't keep process alive just for cleanup
    this.cleanupInterval.unref();
  }

  /**
   * Stop the cleanup interval.
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
  }
  return cacheManagerInstance;
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE LOGGING WITH COLORS
// ═══════════════════════════════════════════════════════════════════════════

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function colorize(text: string, ...colors: string[]): string {
  return colors.join("") + text + COLORS.reset;
}

/**
 * Log a cache hit event with colors.
 */
export async function logCacheHit(
  toolName: string,
  inputSummary: string,
  stats: CacheStats,
): Promise<void> {
  const logger = await getLogger();
  const hitRatePercent = (stats.hitRate * 100).toFixed(1);
  const hitRateColor = stats.hitRate > 0.5 ? COLORS.green : stats.hitRate > 0.2 ? COLORS.yellow : COLORS.red;

  const message = [
    colorize("⚡ CACHE HIT", COLORS.bright, COLORS.green),
    colorize(`[${toolName}]`, COLORS.cyan),
    colorize(`"${inputSummary}"`, COLORS.dim),
  ].join(" ");

  const statsLine = [
    colorize(`📊 Stats:`, COLORS.bright, COLORS.magenta),
    colorize(`${stats.hits}/${stats.hits + stats.misses}`, hitRateColor),
    colorize(`(${hitRatePercent}% hit rate)`, hitRateColor),
    colorize(`| Entries: ${stats.entries}`, COLORS.blue),
    colorize(`| Size: ${formatBytes(stats.size)}/${formatBytes(stats.maxSize)}`, COLORS.cyan),
  ].join(" ");

  logger.info({ tool: toolName, cacheHit: true, hitRate: stats.hitRate }, message);
  logger.debug({ tool: toolName }, statsLine);
}

/**
 * Log a cache miss event with colors.
 */
export async function logCacheMiss(
  toolName: string,
  inputSummary: string,
  stats: CacheStats,
): Promise<void> {
  const logger = await getLogger();
  const hitRatePercent = (stats.hitRate * 100).toFixed(1);

  const message = [
    colorize("💨 CACHE MISS", COLORS.bright, COLORS.yellow),
    colorize(`[${toolName}]`, COLORS.cyan),
    colorize(`"${inputSummary}"`, COLORS.dim),
  ].join(" ");

  const statsLine = [
    colorize(`📊 Stats:`, COLORS.bright, COLORS.magenta),
    colorize(`${stats.hits}/${stats.hits + stats.misses}`, COLORS.yellow),
    colorize(`(${hitRatePercent}% hit rate)`, COLORS.yellow),
    colorize(`| Misses: ${stats.misses}`, COLORS.red),
    colorize(`| Evictions: ${stats.evictions}`, COLORS.red),
  ].join(" ");

  logger.info({ tool: toolName, cacheHit: false, hitRate: stats.hitRate }, message);
  logger.debug({ tool: toolName }, statsLine);
}

/**
 * Log cache store event.
 */
export async function logCacheStore(
  toolName: string,
  inputSummary: string,
  valueSize: number,
): Promise<void> {
  const logger = await getLogger();

  const message = [
    colorize("💾 CACHE STORE", COLORS.bright, COLORS.blue),
    colorize(`[${toolName}]`, COLORS.cyan),
    colorize(`"${inputSummary}"`, COLORS.dim),
    colorize(`(${formatBytes(valueSize)})`, COLORS.green),
  ].join(" ");

  logger.debug({ tool: toolName, cacheStore: true, size: valueSize }, message);
}

/**
 * Log overall cache statistics summary.
 */
export async function logCacheStatsSummary(): Promise<void> {
  const logger = await getLogger();
  const manager = getCacheManager();
  const allStats = manager.getAllStats();

  if (allStats.size === 0) {
    logger.info({}, colorize("📊 Cache: No active caches", COLORS.dim));
    return;
  }

  const header = [
    "",
    colorize("╔══════════════════════════════════════════════════════════════════════════════════════╗", COLORS.cyan),
    colorize("║                              📊 CACHE STATISTICS SUMMARY                              ║", COLORS.bright, COLORS.cyan),
    colorize("╠══════════════════════════════════════════════════════════════════════════════════════╣", COLORS.cyan),
  ].join("\n");

  logger.info({}, header);

  let totalHits = 0;
  let totalMisses = 0;
  let totalSize = 0;
  let totalEntries = 0;

  for (const [name, stats] of allStats.entries()) {
    totalHits += stats.hits;
    totalMisses += stats.misses;
    totalSize += stats.size;
    totalEntries += stats.entries;

    const hitRatePercent = (stats.hitRate * 100).toFixed(1);
    const hitRateColor = stats.hitRate > 0.5 ? COLORS.green : stats.hitRate > 0.2 ? COLORS.yellow : COLORS.red;
    const sizePercent = ((stats.size / stats.maxSize) * 100).toFixed(0);

    const line = [
      colorize("║", COLORS.cyan),
      colorize(` ${name.padEnd(18)}`, COLORS.bright, COLORS.white),
      colorize(`│ Hit Rate: `, COLORS.dim),
      colorize(`${hitRatePercent.padStart(5)}%`, hitRateColor),
      colorize(` │ Hits: `, COLORS.dim),
      colorize(`${stats.hits.toString().padStart(5)}`, COLORS.green),
      colorize(` │ Miss: `, COLORS.dim),
      colorize(`${stats.misses.toString().padStart(5)}`, COLORS.red),
      colorize(` │ Size: `, COLORS.dim),
      colorize(`${formatBytes(stats.size).padStart(8)}`, COLORS.blue),
      colorize(` (${sizePercent}%)`, COLORS.dim),
      colorize(" ║", COLORS.cyan),
    ].join("");

    logger.info({ cache: name, ...stats }, line);
  }

  const totalOps = totalHits + totalMisses;
  const overallHitRate = totalOps > 0 ? ((totalHits / totalOps) * 100).toFixed(1) : "0.0";
  const overallColor = totalOps > 0 && totalHits / totalOps > 0.5 ? COLORS.green : COLORS.yellow;

  const footer = [
    colorize("╠══════════════════════════════════════════════════════════════════════════════════════╣", COLORS.cyan),
    colorize("║", COLORS.cyan) +
      colorize(` TOTAL              `, COLORS.bright, COLORS.white) +
      colorize(`│ Hit Rate: `, COLORS.dim) +
      colorize(`${overallHitRate.padStart(5)}%`, overallColor) +
      colorize(` │ Hits: `, COLORS.dim) +
      colorize(`${totalHits.toString().padStart(5)}`, COLORS.green) +
      colorize(` │ Miss: `, COLORS.dim) +
      colorize(`${totalMisses.toString().padStart(5)}`, COLORS.red) +
      colorize(` │ Size: `, COLORS.dim) +
      colorize(`${formatBytes(totalSize).padStart(8)}`, COLORS.blue) +
      colorize(`       `, COLORS.dim) +
      colorize(" ║", COLORS.cyan),
    colorize("╚══════════════════════════════════════════════════════════════════════════════════════╝", COLORS.cyan),
    "",
  ].join("\n");

  logger.info({ totalHits, totalMisses, totalSize, totalEntries }, footer);
}

/**
 * Create a summary of the input for logging (truncated).
 */
export function summarizeInput(input: Record<string, unknown>, maxLength = 50): string {
  const query = input.query ?? input.sql ?? input.keywords;
  if (typeof query === "string") {
    return query.length > maxLength ? query.slice(0, maxLength) + "..." : query;
  }
  if (Array.isArray(query)) {
    return query.slice(0, 3).join(", ") + (query.length > 3 ? "..." : "");
  }
  const str = JSON.stringify(input);
  return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
}
