import type { UsageRecord } from "./types.js";

export class UsageTracker {
  private readonly records: UsageRecord[] = [];

  track(record: UsageRecord): void {
    this.records.push(record);
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
    const oneMinuteAgo = now - 60_000;
    return this.getUserUsageInWindow(userId, oneMinuteAgo).length;
  }
}
