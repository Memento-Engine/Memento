import { createContext } from "react";

export interface CreditsData {
  total: number;
  used: number;
  available: number;
}

export interface UsageStats {
  daily: {
    requests: number;
    tokens: number;
    limit: number;
  };
  minute: {
    requests: number;
    limit: number;
  };
}

export interface CreditsContextType {
  credits: CreditsData;
  usage: UsageStats;
  tier: "free" | "premium";
  userRole: "anonymous" | "logged";
  isLoading: boolean;
  error: string | null;
  refreshCredits: () => Promise<void>;
  hasPremiumCredits: boolean;
}

export function creditsContextEmptyState(): CreditsContextType {
  return {
    credits: {
      total: 0,
      used: 0,
      available: 0,
    },
    usage: {
      daily: { requests: 0, tokens: 0, limit: 0 },
      minute: { requests: 0, limit: 0 },
    },
    tier: "free",
    userRole: "anonymous",
    isLoading: true,
    error: null,
    refreshCredits: async () => {},
    hasPremiumCredits: false,
  };
}

export const CreditsContext = createContext<CreditsContextType>(
  creditsContextEmptyState()
);
