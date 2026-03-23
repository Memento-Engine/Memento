import type { GatewayConfig } from "@/config.ts";
import { DAILY_TOKEN_QUOTA } from "@/config.ts";
import { UsageTracker, QuotaInfo } from "@/usageTracker.ts";
import type { UserRole, UserTier } from "@/types.ts";

export type { UserTier };

// Rate limit error types
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly type: "requests_per_minute" | "daily_tokens" | "quota_exceeded",
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
  /** Quota info for the user */
  quota?: QuotaInfo;
  retryAfterMs?: number;
}

export interface EnforceOptions {
  deviceId: string;
  userId?: string;
  userRole: UserRole;
  estimatedTokens: number;
  now?: number;
}

export class RateLimiter {
  constructor(
    private readonly config: GatewayConfig,
    private readonly usageTracker: UsageTracker,
  ) {}

  /**
   * Resolve user tier based on role and quota remaining
   * Premium tier = logged in user with quota remaining
   */
  resolveTier(userRole: UserRole, quotaRemaining: number): UserTier {
    if (userRole === "logged" && quotaRemaining > 0) {
      return "premium";
    }
    return "free";
  }

  /**
   * Check if a request should be allowed
   */
  async checkRateLimit(options: EnforceOptions): Promise<RateLimitResult> {
    const {
      deviceId,
      userId,
      userRole,
      estimatedTokens,
      now = Date.now(),
    } = options;

    try {
      const stats = await this.usageTracker.getUsageStats(deviceId, userId);
      
      // Get quota info for logged-in users
      let quota: QuotaInfo | undefined;
      if (userId && userRole === "logged") {
        quota = await this.usageTracker.getQuotaInfo(userId, userRole);
      }

      const tier = this.resolveTier(userRole, quota?.tokensRemaining ?? 0);
      const limits = this.config.limits[tier];

      // Check requests per minute
      if (stats.minuteRequests >= limits.requestsPerMinute) {
        const retryAfterMs = 60_000 - (now % 60_000);
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${limits.requestsPerMinute} requests/minute`,
          tier,
          remainingRequests: 0,
          quota,
          retryAfterMs,
        };
      }

      // NOTE: We don't block on quota exhaustion - instead, the server will
      // fallback to free models gracefully. The quota info is passed through
      // so the server knows whether to use premium or free models.

      return {
        allowed: true,
        tier,
        remainingRequests: limits.requestsPerMinute - stats.minuteRequests - 1,
        quota,
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
    const tier: UserTier = "free";
    const limits = this.config.limits[tier];

    const requestCount = this.usageTracker.getUserRequestCountInLastMinute(userId, now);
    if (requestCount >= limits.requestsPerMinute) {
      throw new RateLimitError(
        `Rate limit exceeded: ${limits.requestsPerMinute} requests/minute`,
        "requests_per_minute",
        tier,
        60_000 - (now % 60_000)
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
    const tier: UserTier = "free";
    const limits = this.config.limits[tier];

    const requestCount = this.usageTracker.getUserRequestCountInLastMinute(userId, now);
    if (requestCount >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.requestsPerMinute} requests/minute`,
        tier,
        remainingRequests: 0,
        retryAfterMs: 60_000,
      };
    }

    return {
      allowed: true,
      tier,
      remainingRequests: limits.requestsPerMinute - requestCount - 1,
    };
  }
}
