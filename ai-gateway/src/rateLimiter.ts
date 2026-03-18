import type { GatewayConfig } from "@/config.ts";
import { UsageTracker, CREDIT_COSTS, ANONYMOUS_PREMIUM_CREDITS, LOGGED_IN_PREMIUM_CREDITS } from "@/usageTracker.ts";
import type { UserRole, UserTier } from "@/types.ts";

export type { UserTier };

// Rate limit error types
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly type: "requests_per_minute" | "daily_tokens" | "no_credits",
    public readonly tier: UserTier,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  tier: UserTier;
  remainingRequests?: number;
  remainingTokens?: number;
  remainingCredits?: number;
  retryAfterMs?: number;
}

export interface EnforceOptions {
  deviceId: string;
  userId?: string;
  userRole: UserRole;
  estimatedTokens: number;
  isPremiumRequest?: boolean;
  now?: number;
}

export class RateLimiter {
  constructor(
    private readonly config: GatewayConfig,
    private readonly usageTracker: UsageTracker,
  ) {}

  /**
   * Resolve user tier based on role and available credits
   */
  resolveTier(userRole: UserRole, hasCredits: boolean): UserTier {
    // Premium tier if user is logged in AND has credits
    if (userRole === "logged" && hasCredits) {
      return "premium";
    }
    return "free";
  }

  /**
   * Get credit allowance based on user role
   */
  getCreditAllowance(userRole: UserRole): number {
    return userRole === "logged" ? LOGGED_IN_PREMIUM_CREDITS : ANONYMOUS_PREMIUM_CREDITS;
  }

  /**
   * Check if a request should be allowed (async version with DB)
   */
  async checkRateLimit(options: EnforceOptions): Promise<RateLimitResult> {
    const {
      deviceId,
      userId,
      userRole,
      estimatedTokens,
      isPremiumRequest = false,
      now = Date.now(),
    } = options;

    try {
      const stats = await this.usageTracker.getUsageStats(deviceId, userId);
      const hasCredits = stats.availableCredits > 0;
      const tier = this.resolveTier(userRole, hasCredits);
      const limits = this.config.limits[tier];

      // Check requests per minute
      if (stats.minuteRequests >= limits.requestsPerMinute) {
        const retryAfterMs = 60_000 - (now % 60_000);
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${limits.requestsPerMinute} requests/minute for ${tier}`,
          tier,
          remainingRequests: 0,
          retryAfterMs,
        };
      }

      // Check daily token limit
      if (stats.dailyTokens + estimatedTokens > limits.dailyTokenLimit) {
        return {
          allowed: false,
          reason: `Token limit exceeded: ${limits.dailyTokenLimit} daily tokens for ${tier} (used ${stats.dailyTokens})`,
          tier,
          remainingTokens: Math.max(0, limits.dailyTokenLimit - stats.dailyTokens),
        };
      }

      // Check premium credits if needed for premium request
      if (isPremiumRequest && stats.availableCredits < CREDIT_COSTS.premium) {
        return {
          allowed: false,
          reason: `No premium credits available. You have ${stats.availableCredits} credits.`,
          tier,
          remainingCredits: stats.availableCredits,
        };
      }

      return {
        allowed: true,
        tier,
        remainingRequests: limits.requestsPerMinute - stats.minuteRequests - 1,
        remainingTokens: limits.dailyTokenLimit - stats.dailyTokens - estimatedTokens,
        remainingCredits: isPremiumRequest 
          ? stats.availableCredits - CREDIT_COSTS.premium 
          : stats.availableCredits,
      };
    } catch (error) {
      console.error("Error checking rate limit:", error);
      // Fallback to in-memory rate limiting
      return this.checkInMemoryRateLimit(userId || deviceId, userRole, estimatedTokens, now);
    }
  }

  /**
   * Synchronous enforcement using in-memory tracking (legacy support)
   * @deprecated Use checkRateLimit() instead for proper tier resolution
   */
  enforce(userId: string, estimatedTokens: number, now: number = Date.now()): void {
    // Legacy method defaults to free tier since we don't have user role context
    const tier: UserTier = "free";
    const limits = this.config.limits[tier];

    const requestCount = this.usageTracker.getUserRequestCountInLastMinute(userId, now);
    if (requestCount >= limits.requestsPerMinute) {
      throw new RateLimitError(
        `Rate limit exceeded: ${limits.requestsPerMinute} requests/minute for ${tier}`,
        "requests_per_minute",
        tier,
        60_000 - (now % 60_000)
      );
    }

    const dayStart = startOfUtcDay(now);
    const usedToday = this.usageTracker.getUserDailyTokens(userId, dayStart);

    if (usedToday + estimatedTokens > limits.dailyTokenLimit) {
      throw new RateLimitError(
        `Token limit exceeded: ${limits.dailyTokenLimit} daily tokens for ${tier} (used ${usedToday})`,
        "daily_tokens",
        tier
      );
    }
  }

  /**
   * In-memory rate limit check (fallback)
   */
  private checkInMemoryRateLimit(
    userId: string,
    userRole: UserRole,
    estimatedTokens: number,
    now: number
  ): RateLimitResult {
    // For in-memory, assume no premium credits available
    const tier: UserTier = "free";
    const limits = this.config.limits[tier];

    const requestCount = this.usageTracker.getUserRequestCountInLastMinute(userId, now);
    if (requestCount >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.requestsPerMinute} requests/minute for ${tier}`,
        tier,
        remainingRequests: 0,
        retryAfterMs: 60_000,
      };
    }

    const dayStart = startOfUtcDay(now);
    const usedToday = this.usageTracker.getUserDailyTokens(userId, dayStart);

    if (usedToday + estimatedTokens > limits.dailyTokenLimit) {
      return {
        allowed: false,
        reason: `Token limit exceeded: ${limits.dailyTokenLimit} daily tokens for ${tier} (used ${usedToday})`,
        tier,
        remainingTokens: Math.max(0, limits.dailyTokenLimit - usedToday),
      };
    }

    return {
      allowed: true,
      tier,
      remainingRequests: limits.requestsPerMinute - requestCount - 1,
      remainingTokens: limits.dailyTokenLimit - usedToday - estimatedTokens,
      remainingCredits: 0,
    };
  }
}

