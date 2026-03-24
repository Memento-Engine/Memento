"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditsContext, QuotaData, UsageStats } from "@/contexts/creditsContext";
import { AI_GATEWAY_BASE_URL } from "@/api/base";
import { GatewayResponse } from "@shared/types/gateway";
import { clearAuthState } from "@/lib/auth";
import useOnboarding from "@/hooks/useOnboarding";
import { getAuthHeaders } from "@/api/auth";
import useAuth from "@/hooks/useAuth";

interface CreditsProviderProps {
  children: React.ReactNode;
}

interface UsageResponseData {
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  deviceId: string;
  userRole: "anonymous" | "logged";
  tier: "free" | "premium";
  quota: {
    dailyQuota: number;
    tokensUsed: number;
    tokensRemaining: number;
    percentRemaining: number;
    canMakeRequest: boolean;
    resetInMs: number;
  } | null;
  usage: {
    daily: {
      requests: number;
      tokens: number;
    };
    minute: {
      requests: number;
      limit: number;
    };
  };
}

export default function CreditsProvider({ children }: CreditsProviderProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [usage, setUsage] = useState<UsageStats>({
    daily: { requests: 0, tokens: 0 },
    minute: { requests: 0, limit: 0 },
  });
  const [tier, setTier] = useState<"free" | "premium">("free");
  const [userRole, setUserRole] = useState<"anonymous" | "logged">("anonymous");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setIsOnboardingComplete } = useOnboarding();
  const { user } = useAuth();

  const refreshCredits = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get auth headers from OS keyring asynchronously
      const headers = await getAuthHeaders();

      // Need access token for auth to fetch usage
      if (!headers["Authorization"]) {
        console.log("No access token available - user not authenticated");
        setIsLoading(false);
        // Not an error - user might be anonymous or not logged in yet
        return;
      }

      const response = await fetch(`${AI_GATEWAY_BASE_URL}/usage`, {
        method: "GET",
        headers,
      });

      // Handle auth errors - trigger re-onboarding
      if (response.status === 401) {
        console.error("Auth error from usage API - triggering re-onboarding");
        await clearAuthState();
        setIsOnboardingComplete(false);
        setError("Device not registered - please complete setup");
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch usage: ${response.status}`);
      }

      const result: GatewayResponse<UsageResponseData> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || "Failed to fetch usage data");
      }

      const data = result.data;
      setQuota(data.quota);
      setUsage(data.usage);
      setTier(data.tier);
      setUserRole(data.userRole);
    } catch (err) {
      console.error("Failed to refresh credits:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch credits");
    } finally {
      setIsLoading(false);
    }
  }, [setIsOnboardingComplete]);

  // Fetch credits on mount, when auth changes, and poll updates
  useEffect(() => {
    refreshCredits();

    // Poll for updates every 30 seconds
    const interval = setInterval(refreshCredits, 30000);
    return () => clearInterval(interval);
  }, [refreshCredits, user?.id]); // Re-fetch when user changes

  return (
    <CreditsContext.Provider
      value={{
        quota,
        usage,
        tier,
        userRole,
        isLoading,
        error,
        refreshCredits,
        hasQuotaRemaining: quota ? quota.canMakeRequest : false,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
}
