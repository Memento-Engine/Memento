import type { UsageRecord, UserRole, GatewayRole } from "@/types.ts";
import { db } from "@/db/index.ts";
import { usageLog, dailyUsage, device } from "@/db/schema.ts";
import { eq, and, sql, gte } from "drizzle-orm";
import { childLogger } from "@/utils/logger.ts";
import { DAILY_TOKEN_QUOTA, QUOTA_COUNTED_ROLES } from "@/config.ts";

const log = childLogger("usageTracker");

// ============ TOKEN-BASED QUOTA SYSTEM ============
// Each user gets a daily token quota (e.g., 50,000 tokens = 100%)
// Only "expensive" roles (planner, executor, final) count towards quota
// Simple queries that exit early don't consume quota

export interface TrackUsageParams {
  deviceId: string;
  userId?: string;
  userRole: UserRole;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  role?: GatewayRole;
  fallbackUsed?: boolean;
  contextWindowSize?: number;
}

export interface UsageStats {
  dailyTokens: number;
  dailyRequests: number;
  minuteRequests: number;
}

export interface QuotaInfo {
  /** Daily token quota (100% = this value) */
  dailyQuota: number;
  /** Tokens used today */
  tokensUsed: number;
  /** Tokens remaining (can be negative if overdraft) */
  tokensRemaining: number;
  /** Percentage remaining (0-100, can be negative) */
  percentRemaining: number;
  /** Whether user can make another request (> 0% OR first request of day) */
  canMakeRequest: boolean;
  /** Time until quota resets (ms) */
  resetInMs: number;
}

/**
 * Check if an identifier looks like an IP address (for anonymous users)
 */
function isIpAddress(id: string): boolean {
  // IPv4 pattern
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  // localhost
  if (id === "::1" || id === "127.0.0.1" || id === "unknown") {
    return true;
  }
  return ipv4Regex.test(id) || ipv6Regex.test(id) || id.includes(":");
}

export class UsageTracker {
  // In-memory cache for fast rate limiting (for anonymous users and fallback)
  private readonly records: UsageRecord[] = [];
  private readonly minuteRequestCache = new Map<string, { count: number; resetAt: number }>();
  private readonly dailyTokenCache = new Map<string, { tokens: number; dateKey: string }>();

  /**
   * Check if this is an anonymous request (using IP address)
   */
  isAnonymousRequest(deviceId: string, userId?: string): boolean {
    return !userId && isIpAddress(deviceId);
  }

  /**
   * Track usage - uses in-memory for anonymous, database for authenticated
   */
  async trackUsage(params: TrackUsageParams): Promise<void> {
    const {
      deviceId,
      userId,
      userRole,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      role,
      fallbackUsed = false,
      contextWindowSize = 0,
    } = params;

    // Check if this role counts towards quota
    const countsTowardsQuota = role ? QUOTA_COUNTED_ROLES.has(role) : false;

    log.debug({ 
      model, 
      totalTokens, 
      role,
      countsTowardsQuota,
      isAnonymous: this.isAnonymousRequest(deviceId, userId) 
    }, "Tracking usage");

    // For anonymous users, use in-memory tracking only (no DB writes)
    if (this.isAnonymousRequest(deviceId, userId)) {
      this.track({
        user_id: deviceId,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        timestamp: Date.now(),
      });
      return;
    }

    if (!userId) {
      log.warn({ deviceId }, "Skipping DB usage tracking because authenticated request has no userId");
      return;
    }

    // For authenticated users, track in database
    const dateKey = this.getDateKey();

    try {
      // 1. Insert usage log entry
      await db.insert(usageLog).values({
        userId,
        deviceId: undefined,
        modelUsed: model,
        fallbackUsed,
        promptTokens,
        completionTokens,
        totalTokens,
        role,
        userRole,
        contextWindowSize,
      });

      // 2. Update daily usage - only count tokens if role is quota-counted
      const tokensToAdd = countsTowardsQuota ? totalTokens : 0;

      const [existingDailyUsage] = await db
        .select({ id: dailyUsage.id })
        .from(dailyUsage)
        .where(
          and(
            eq(dailyUsage.userId, userId),
            eq(dailyUsage.dateKey, dateKey),
          )
        )
        .limit(1);

      if (existingDailyUsage) {
        await db
          .update(dailyUsage)
          .set({
            requestCount: sql`${dailyUsage.requestCount} + 1`,
            totalTokens: sql`${dailyUsage.totalTokens} + ${tokensToAdd}`,
            lastMinuteRequestCount: sql`${dailyUsage.lastMinuteRequestCount} + 1`,
            lastMinuteResetAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dailyUsage.id, existingDailyUsage.id));
      } else {
        await db.insert(dailyUsage).values({
          userId,
          deviceId: undefined,
          dateKey,
          requestCount: 1,
          totalTokens: tokensToAdd,
          lastMinuteRequestCount: 1,
          lastMinuteResetAt: new Date(),
        });
      }

    } catch (error) {
      log.error({ error }, "Failed to track usage in DB, falling back to in-memory");
      this.track({
        user_id: userId || deviceId,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get quota info for a user - the main method for checking usage
   */
  async getQuotaInfo(userId: string, userRole: UserRole): Promise<QuotaInfo> {
    const dateKey = this.getDateKey();
    const dailyQuota = userRole === "logged" 
      ? DAILY_TOKEN_QUOTA.logged 
      : DAILY_TOKEN_QUOTA.anonymous;

    try {
      // Get today's token usage
      const [daily] = await db
        .select({ totalTokens: dailyUsage.totalTokens })
        .from(dailyUsage)
        .where(
          and(
            eq(dailyUsage.userId, userId),
            eq(dailyUsage.dateKey, dateKey)
          )
        )
        .limit(1);

      const tokensUsed = daily?.totalTokens ?? 0;
      const tokensRemaining = dailyQuota - tokensUsed;
      const percentRemaining = Math.round((tokensRemaining / dailyQuota) * 100);

      // Allow request if quota > 0 (overdraft allowed - they can go negative)
      const canMakeRequest = tokensRemaining > 0;

      // Calculate time until midnight UTC
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      const resetInMs = midnight.getTime() - now.getTime();

      return {
        dailyQuota,
        tokensUsed,
        tokensRemaining,
        percentRemaining,
        canMakeRequest,
        resetInMs,
      };
    } catch (error) {
      log.error({ error }, "Failed to get quota info");
      // Return safe defaults that allow requests
      return {
        dailyQuota,
        tokensUsed: 0,
        tokensRemaining: dailyQuota,
        percentRemaining: 100,
        canMakeRequest: true,
        resetInMs: 0,
      };
    }
  }

  /**
   * Get usage stats for a device/user (simplified - for rate limiting)
   */
  async getUsageStats(deviceId: string, userId?: string): Promise<UsageStats> {
    // For anonymous users, use in-memory stats only
    if (this.isAnonymousRequest(deviceId, userId)) {
      return this.getInMemoryStats(deviceId);
    }

    const dateKey = this.getDateKey();
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    try {
      // Get daily usage
      const daily = await db
        .select()
        .from(dailyUsage)
        .where(
          and(
            eq(dailyUsage.userId, userId || ''),
            eq(dailyUsage.dateKey, dateKey)
          )
        )
        .limit(1);

      // Get minute request count from recent logs
      const minuteCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(usageLog)
        .where(
          and(
            eq(usageLog.userId, userId || ''),
            gte(usageLog.createdAt, oneMinuteAgo)
          )
        );

      return {
        dailyTokens: daily[0]?.totalTokens || 0,
        dailyRequests: daily[0]?.requestCount || 0,
        minuteRequests: Number(minuteCount[0]?.count || 0),
      };
    } catch (error) {
      log.error({ error }, "Failed to get usage stats");
      return this.getInMemoryStats(userId || deviceId);
    }
  }

  /**
   * Update device with user info when they log in
   */
  async linkDeviceToUser(deviceId: string, userId: string): Promise<void> {
    try {
      await db
        .update(device)
        .set({ userId, updatedAt: new Date() })
        .where(eq(device.id, deviceId));
    } catch (error) {
      log.error({ error }, "Failed to link device to user");
    }
  }

  // ============ IN-MEMORY METHODS (for anonymous/fallback) ============

  private getDateKey(date: Date = new Date()): string {
    return date.toISOString().split("T")[0];
  }

  track(record: UsageRecord): void {
    this.records.push(record);

    // Update minute request cache
    const cacheKey = record.user_id;
    const now = Date.now();
    const cached = this.minuteRequestCache.get(cacheKey);

    if (cached && now - cached.resetAt < 60_000) {
      cached.count++;
    } else {
      this.minuteRequestCache.set(cacheKey, { count: 1, resetAt: now });
    }
  }

  getUserUsageInWindow(userId: string, fromTimestamp: number): UsageRecord[] {
    return this.records.filter(
      (record) => record.user_id === userId && record.timestamp >= fromTimestamp,
    );
  }

  getUserDailyTokens(userId: string, dayStartTimestamp: number): number {
    return this.getUserUsageInWindow(userId, dayStartTimestamp).reduce(
      (sum, record) => sum + record.total_tokens,
      0,
    );
  }

  getUserRequestCountInLastMinute(userId: string, now: number): number {
    const cached = this.minuteRequestCache.get(userId);
    if (cached && now - cached.resetAt < 60_000) {
      return cached.count;
    }

    const oneMinuteAgo = now - 60_000;
    return this.getUserUsageInWindow(userId, oneMinuteAgo).length;
  }

  private getInMemoryStats(userId: string): UsageStats {
    const now = Date.now();
    const dayStart = new Date().setUTCHours(0, 0, 0, 0);

    return {
      dailyTokens: this.getUserDailyTokens(userId, dayStart),
      dailyRequests: this.getUserUsageInWindow(userId, dayStart).length,
      minuteRequests: this.getUserRequestCountInLastMinute(userId, now),
    };
  }
}
