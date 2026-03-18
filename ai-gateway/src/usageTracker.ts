import type { UsageRecord, UserRole, GatewayRole } from "@/types.ts";
import { db } from "@/db/index.ts";
import { usageLog, dailyUsage, premiumCredits, device } from "@/db/schema.ts";
import { eq, and, sql, gte } from "drizzle-orm";
import { childLogger } from "@/utils/logger.ts";

const log = childLogger("usageTracker");

// Credit constants
export const ANONYMOUS_PREMIUM_CREDITS = 3;
export const LOGGED_IN_PREMIUM_CREDITS = 5;

// Credit cost per model tier
export const CREDIT_COSTS = {
  premium: 1,    // Premium models cost 1 credit
  standard: 0,   // Standard/free models cost nothing
};

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
  isPremiumRequest?: boolean;
  creditsCost?: number;
  contextWindowSize?: number;
}

export interface UsageStats {
  dailyTokens: number;
  dailyRequests: number;
  minuteRequests: number;
  availableCredits: number;
  usedCredits: number;
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
      isPremiumRequest = false,
      creditsCost = 0,
      contextWindowSize = 0,
    } = params;

    log.debug({ model, completionTokens, isPremiumRequest, isAnonymous: this.isAnonymousRequest(deviceId, userId) }, "Usage params");

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
      // 1. Insert usage log entry (user_id is the primary key for authenticated users)
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
        creditsCost,
        isPremiumRequest,
        contextWindowSize,
      });

      // 2. Update or insert daily usage without relying on a DB-level unique constraint.
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
            totalTokens: sql`${dailyUsage.totalTokens} + ${totalTokens}`,
            premiumCreditsUsed: sql`${dailyUsage.premiumCreditsUsed} + ${creditsCost}`,
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
          totalTokens,
          premiumCreditsUsed: creditsCost,
          lastMinuteRequestCount: 1,
          lastMinuteResetAt: new Date(),
        });
      }

      // 3. Deduct premium credits if used
      if (creditsCost > 0) {
        log.debug({ deviceId, userId, creditsCost }, "Deducting premium credits");
        await this.deductCredits(deviceId, userId, creditsCost);
      }

    } catch (error) {
      log.error({ error }, "Failed to track usage in DB, falling back to in-memory");
      // Fallback to in-memory tracking
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
   * Initialize credits for a new device/user
   */
  async initializeCredits(deviceId: string, userId?: string, userRole: UserRole = "anonymous"): Promise<void> {
    const initialCredits = userRole === "logged" ? LOGGED_IN_PREMIUM_CREDITS : ANONYMOUS_PREMIUM_CREDITS;

    try {
      // Check if credits already exist for this device
      const existing = await db
        .select()
        .from(premiumCredits)
        .where(eq(premiumCredits.deviceId, deviceId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(premiumCredits).values({
          deviceId,
          userId,
          totalCredits: initialCredits,
          usedCredits: 0,
          lastRefillAt: new Date(),
        });
      } else if (userId && !existing[0].userId) {
        // User logged in - upgrade credits if needed
        const currentAvailable = existing[0].totalCredits - existing[0].usedCredits;
        const newCredits = Math.max(LOGGED_IN_PREMIUM_CREDITS, currentAvailable);

        await db
          .update(premiumCredits)
          .set({
            userId,
            totalCredits: existing[0].usedCredits + newCredits,
            updatedAt: new Date(),
          })
          .where(eq(premiumCredits.deviceId, deviceId));
      }
    } catch (error) {
      log.error({ error }, "Failed to initialize credits");
    }
  }

  /**
   * Get available credits for a device/user
   */
  async getAvailableCredits(deviceId: string, userId?: string): Promise<number> {
    try {
      const result = await db
        .select()
        .from(premiumCredits)
        .where(
          userId
            ? eq(premiumCredits.userId, userId)
            : eq(premiumCredits.deviceId, deviceId)
        )
        .limit(1);

      if (result.length === 0) {
        return 0;
      }

      return Math.max(0, result[0].totalCredits - result[0].usedCredits);
    } catch (error) {
      log.error({ error }, "Failed to get available credits");
      return 0;
    }
  }

  /**
   * Deduct credits from a device/user
   */
  async deductCredits(deviceId: string, userId?: string, amount: number = 1): Promise<boolean> {
    try {
      const whereClause = userId
        ? eq(premiumCredits.userId, userId)
        : eq(premiumCredits.deviceId, deviceId);

      const result = await db
        .update(premiumCredits)
        .set({
          usedCredits: sql`${premiumCredits.usedCredits} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(whereClause)
        .returning();

      return result.length > 0;
    } catch (error) {
      log.error({ error }, "Failed to deduct credits");
      return false;
    }
  }

  /**
   * Get usage stats for a device/user
   * Uses in-memory for anonymous users, database for authenticated
   */
  async getUsageStats(deviceId: string, userId?: string): Promise<UsageStats> {
    // For anonymous users, use in-memory stats only
    if (this.isAnonymousRequest(deviceId, userId)) {
      return this.getInMemoryStats(deviceId);
    }

    const dateKey = this.getDateKey();
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    try {
      // Get daily usage (query by user_id for authenticated users))
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

      // Get minute request count from recent logs (query by user_id)
      const minuteCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(usageLog)
        .where(
          and(
            eq(usageLog.userId, userId || ''),
            gte(usageLog.createdAt, oneMinuteAgo)
          )
        );

      // Get available credits
      const availableCredits = await this.getAvailableCredits(deviceId, userId);

      // Get used credits
      const credits = await db
        .select()
        .from(premiumCredits)
        .where(
          userId
            ? eq(premiumCredits.userId, userId)
            : eq(premiumCredits.deviceId, deviceId)
        )
        .limit(1);

      return {
        dailyTokens: daily[0]?.totalTokens || 0,
        dailyRequests: daily[0]?.requestCount || 0,
        minuteRequests: Number(minuteCount[0]?.count || 0),
        availableCredits,
        usedCredits: credits[0]?.usedCredits || 0,
      };
    } catch (error) {
      log.error({ error }, "Failed to get usage stats");
      // Fallback to in-memory
      return this.getInMemoryStats(userId || deviceId);
    }
  }

  /**
   * Check if user has enough credits for a premium request
   */
  async hasCredits(deviceId: string, userId?: string, requiredCredits: number = 1): Promise<boolean> {
    const available = await this.getAvailableCredits(deviceId, userId);
    return available >= requiredCredits;
  }

  /**
   * Update device with user info when they log in
   */
  async linkDeviceToUser(deviceId: string, userId: string): Promise<void> {
    try {
      // Update device
      await db
        .update(device)
        .set({ userId, updatedAt: new Date() })
        .where(eq(device.id, deviceId));

      // Update or upgrade credits
      await this.initializeCredits(deviceId, userId, "logged");
    } catch (error) {
      log.error({ error }, "Failed to link device to user");
    }
  }

  // ============ LEGACY IN-MEMORY METHODS ============

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
      availableCredits: 0,
      usedCredits: 0,
    };
  }
}
