import { 
  clearAccessToken, 
  clearRefreshToken, 
  clearStoredUser 
} from "@/api/auth";

/**
 * Rate limit error details from the gateway
 */
export interface RateLimitInfo {
  tier: string;
  type: "daily_tokens" | "requests_per_minute" | "no_credits";
  retryAfterMs?: number;
  message: string;
}

/**
 * Clears all authentication state from the device.
 * Removes tokens and user data from OS keyring.
 */
export async function clearAuthState(): Promise<void> {
  await clearAccessToken();
  await clearRefreshToken();
  await clearStoredUser();
}

/**
 * Checks if the error indicates device is not registered or auth is invalid.
 * Returns true if re-onboarding is needed.
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("device_not_registered") ||
      message.includes("auth_token_expired") ||
      message.includes("auth_token_missing") ||
      message.includes("device id mismatch") ||
      message.includes("unregistered device") ||
      message.includes("invalid or expired access token") ||
      message.includes("401")
    );
  }
  return false;
}

/**
 * Checks if the error is a rate limit error.
 * Returns parsed rate limit info if it is, null otherwise.
 */
export function parseRateLimitError(error: unknown): RateLimitInfo | null {
  if (error instanceof Error) {
    const message = error.message;
    
    // Check for RATE_LIMIT_ERROR code in message
    if (message.includes("RATE_LIMIT_ERROR") || message.includes("rate limit") || message.includes("Token limit")) {
      // Try to parse tier and type from message
      const tierMatch = message.match(/tier[:\s]+["']?(\w+)["']?/i);
      const typeMatch = message.match(/type[:\s]+["']?(daily_tokens|requests_per_minute|no_credits)["']?/i);
      
      return {
        tier: tierMatch?.[1] || "free",
        type: (typeMatch?.[1] as RateLimitInfo["type"]) || "daily_tokens",
        message: message,
      };
    }
    
    // Check for 429 status
    if (message.includes("429")) {
      return {
        tier: "free",
        type: "daily_tokens",
        message: message,
      };
    }
  }
  return null;
}

/**
 * Handles authentication errors by clearing state.
 * Returns true if auth state was cleared (re-onboarding needed).
 */
export async function handleAuthError(error: unknown): Promise<boolean> {
  if (isAuthError(error)) {
    console.log("Auth error detected, clearing auth state for re-onboarding");
    await clearAuthState();
    return true;
  }
  return false;
}
