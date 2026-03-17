"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditsContext, CreditsData, UsageStats } from "@/contexts/creditsContext";
import { AI_GATEWAY_BASE_URL } from "@/api/base";
import { GatewayResponse } from "@shared/types/gateway";
import { clearAuthState } from "@/lib/auth";
import useOnboarding from "@/hooks/useOnboarding";

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
  credits: {
    total: number;
    used: number;
    available: number;
  };
  usage: {
    daily: {
      requests: number;
      tokens: number;
      limit: number;
    };
    minute: {
      requests: number;
      limit: number;
    };
  };
}

// Helper to get auth headers
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Get access token from cookie
  const cookies = document.cookie.split(";");
  const accessTokenCookie = cookies.find((c) => c.trim().startsWith("accessToken="));
  if (accessTokenCookie) {
    const accessToken = accessTokenCookie.split("=")[1]?.trim();
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
  }

  // Get device ID from localStorage or generate one
  const deviceId = localStorage.getItem("deviceId");
  if (deviceId) {
    headers["X-Device-ID"] = deviceId;
  }

  return headers;
}

export default function CreditsProvider({ children }: CreditsProviderProps) {
  const [credits, setCredits] = useState<CreditsData>({
    total: 0,
    used: 0,
    available: 0,
  });
  const [usage, setUsage] = useState<UsageStats>({
    daily: { requests: 0, tokens: 0, limit: 0 },
    minute: { requests: 0, limit: 0 },
  });
  const [tier, setTier] = useState<"free" | "premium">("free");
  const [userRole, setUserRole] = useState<"anonymous" | "logged">("anonymous");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setIsOnboardingComplete } = useOnboarding();

  const refreshCredits = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const headers = getAuthHeaders();
      
      // We need at least a device ID to fetch credits
      // If not found, user needs to complete onboarding
      if (!headers["X-Device-ID"]) {
        console.log("No device ID available - device not registered");
        setIsLoading(false);
        setError("Device not registered");
        return;
      }

      // Also need access token for auth
      if (!headers["Authorization"]) {
        console.log("No access token available - need to refresh or re-register");
        setIsLoading(false);
        setError("Authentication required");
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
      setCredits(data.credits);
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

  // Fetch credits on mount and when auth changes
  useEffect(() => {
    refreshCredits();

    // Poll for updates every 30 seconds
    const interval = setInterval(refreshCredits, 30000);
    return () => clearInterval(interval);
  }, [refreshCredits]);

  // Listen for storage events (device ID changes)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "deviceId") {
        refreshCredits();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [refreshCredits]);

  return (
    <CreditsContext.Provider
      value={{
        credits,
        usage,
        tier,
        userRole,
        isLoading,
        error,
        refreshCredits,
        hasPremiumCredits: credits.available > 0,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
}
