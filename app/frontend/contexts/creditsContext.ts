import { createContext } from "react";

export interface QuotaData {
  /** Daily token quota (100% = this value) */
  dailyQuota: number;
  /** Tokens used today */
  tokensUsed: number;
  /** Tokens remaining (can be negative if overdraft) */
  tokensRemaining: number;
  /** Percentage remaining (0-100, can be negative) */
  percentRemaining: number;
  /** Whether user can make another request */
  canMakeRequest: boolean;
  /** Time until quota resets (ms) */
  resetInMs: number;
}

export interface UsageStats {
  daily: {
    requests: number;
    tokens: number;
  };
  minute: {
    requests: number;
    limit: number;
  };
}

export interface CreditsContextType {
  /** Quota info (null for anonymous users) */
  quota: QuotaData | null;
  usage: UsageStats;
  tier: "free" | "premium";
  userRole: "anonymous" | "logged";
  isLoading: boolean;
  error: string | null;
  refreshCredits: () => Promise<void>;
  /** Whether user has quota remaining (for premium features) */
  hasQuotaRemaining: boolean;
}

export function creditsContextEmptyState(): CreditsContextType {
  return {
    quota: null,
    usage: {
      daily: { requests: 0, tokens: 0 },
      minute: { requests: 0, limit: 0 },
    },
    tier: "free",
    userRole: "anonymous",
    isLoading: true,
    error: null,
    refreshCredits: async () => {},
    hasQuotaRemaining: false,
  };
}

export const CreditsContext = createContext<CreditsContextType>(
  creditsContextEmptyState()
);
