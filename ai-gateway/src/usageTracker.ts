import type { UsageRecord, UserRole, GatewayRole } from "./types.js";
import { db } from "./db/index.js";
import { usageLog, dailyUsage, premiumCredits, device } from "./db/schema.js";
import { eq, and, sql, gte } from "drizzle-orm";
import { childLogger } from "./utils/logger.js";

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

export class UsageTracker {
  // In-memory cache for fast rate limiting (fallback if DB fails)
  private readonly records: UsageRecord[] = [];
  private readonly minuteRequestCache = new Map<string, { count: number; resetAt: number }>();

  /**
   * Track usage in the database
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

    log.debug({ model, completionTokens, isPremiumRequest }, "Usage params");

    const dateKey = this.getDateKey();

    try {
      // 1. Insert usage log entry
      await db.insert(usageLog).values({
        deviceId,
        userId,
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

      // 2. Update or insert daily usage (composite unique constraint on device_id + date_key)
      await db
        .insert(dailyUsage)
        .values({
          deviceId,
          userId,
          dateKey,
          requestCount: 1,
          totalTokens,
          premiumCreditsUsed: creditsCost,
          lastMinuteRequestCount: 1,
          lastMinuteResetAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dailyUsage.deviceId, dailyUsage.dateKey],
          set: {
            requestCount: sql`${dailyUsage.requestCount} + 1`,
            totalTokens: sql`${dailyUsage.totalTokens} + ${totalTokens}`,
            premiumCreditsUsed: sql`${dailyUsage.premiumCreditsUsed} + ${creditsCost}`,
            updatedAt: new Date(),
          },
        });

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
   */
  async getUsageStats(deviceId: string, userId?: string): Promise<UsageStats> {
    const dateKey = this.getDateKey();
    const oneMinuteAgo = new Date(Date.now() - 60_000);

    try {
      // Get daily usage
      const daily = await db
        .select()
        .from(dailyUsage)
        .where(
          and(
            eq(dailyUsage.deviceId, deviceId),
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
            eq(usageLog.deviceId, deviceId),
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
