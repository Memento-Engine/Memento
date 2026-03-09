import type { GatewayConfig } from "./config.js";
import { UsageTracker } from "./usageTracker.js";

export type UserTier = "free" | "pro";

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export class RateLimiter {
  constructor(
    private readonly config: GatewayConfig,
    private readonly usageTracker: UsageTracker,
  ) {}

  resolveTier(userId: string): UserTier {
    return this.config.limits.proUsers.includes(userId) ? "pro" : "free";
  }

  enforce(userId: string, estimatedTokens: number, now: number = Date.now()): void {
    const tier = this.resolveTier(userId);
    const limits = this.config.limits[tier];

    const requestCount = this.usageTracker.getUserRequestCountInLastMinute(userId, now);
    if (requestCount >= limits.requestsPerMinute) {
      throw new Error(`Rate limit exceeded: ${limits.requestsPerMinute} requests/minute for ${tier}`);
    }

    const dayStart = startOfUtcDay(now);
    const usedToday = this.usageTracker.getUserDailyTokens(userId, dayStart);

    if (usedToday + estimatedTokens > limits.dailyTokenLimit) {
      throw new Error(
        `Token limit exceeded: ${limits.dailyTokenLimit} daily tokens for ${tier} (used ${usedToday})`,
      );
    }
  }
}
