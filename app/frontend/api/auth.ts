/**
 * Authentication API functions for Tauri Desktop App
 * 
 * Uses OS keyring (Windows Credential Manager / macOS Keychain) for secure token storage.
 * This is the proper approach for desktop apps - NOT cookies or localStorage.
 * 
 * Storage model:
 * - Access Token: OS keyring (short-lived, 15min)
 * - Refresh Token: OS keyring (long-lived, 30 days)
 * - User Data: OS keyring (cached for quick startup)
 */

import { AI_GATEWAY_BASE_URL } from "./base";
import { 
  getPassword, 
  setPassword, 
  deletePassword 
} from "tauri-plugin-keyring-api";
import { invoke } from "@tauri-apps/api/core";
import type { User, SessionInfo } from "@/contexts/authContext";

// Google OAuth client ID
export const GOOGLE_CLIENT_ID = "546479298512-qhvsk7inkt482tq7g1kaujgtvpjjtjlr.apps.googleusercontent.com";

// Keyring service/account names for secure token storage
const KEYRING_SERVICE = "memento-ai";
const KEYRING_ACCESS_TOKEN = "access-token";
const KEYRING_REFRESH_TOKEN = "refresh-token";
const KEYRING_USER_DATA = "user-data";

const ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 60;
let refreshInFlight: Promise<{ accessToken: string; refreshToken: string }> | null = null;

// Auth routes are mounted at /auth/* (not /v1/auth/*).
const AUTH_BASE_URL = AI_GATEWAY_BASE_URL.replace(/\/v1\/?$/, "");

// ============================================================================
// Token Storage (OS Keyring)
// ============================================================================

/**
 * Get access token from OS keyring
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    return await getPassword(KEYRING_SERVICE, KEYRING_ACCESS_TOKEN);
  } catch {
    return null;
  }
}

/**
 * Save access token to OS keyring
 */
export async function setAccessToken(token: string): Promise<void> {
  await setPassword(KEYRING_SERVICE, KEYRING_ACCESS_TOKEN, token);
}

/**
 * Clear access token from OS keyring
 */
export async function clearAccessToken(): Promise<void> {
  try {
    await deletePassword(KEYRING_SERVICE, KEYRING_ACCESS_TOKEN);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Get refresh token from OS keyring
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    return await getPassword(KEYRING_SERVICE, KEYRING_REFRESH_TOKEN);
  } catch {
    return null;
  }
}

/**
 * Save refresh token to OS keyring
 */
export async function setRefreshToken(token: string): Promise<void> {
  await setPassword(KEYRING_SERVICE, KEYRING_REFRESH_TOKEN, token);
}

/**
 * Clear refresh token from OS keyring
 */
export async function clearRefreshToken(): Promise<void> {
  try {
    await deletePassword(KEYRING_SERVICE, KEYRING_REFRESH_TOKEN);
  } catch {
    // Ignore if doesn't exist
  }
}

// ============================================================================
// User Data Storage (OS Keyring)
// ============================================================================

/**
 * Get cached user data from OS keyring
 */
export async function getStoredUser(): Promise<User | null> {
  try {
    const userData = await getPassword(KEYRING_SERVICE, KEYRING_USER_DATA);
    if (userData) {
      return JSON.parse(userData) as User;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save user data to OS keyring for quick startup
 */
export async function setStoredUser(user: User): Promise<void> {
  await setPassword(KEYRING_SERVICE, KEYRING_USER_DATA, JSON.stringify(user));
}

/**
 * Clear user data from OS keyring
 */
export async function clearStoredUser(): Promise<void> {
  try {
    await deletePassword(KEYRING_SERVICE, KEYRING_USER_DATA);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Check if user is authenticated
 * Checks for valid access token, or tries to refresh with stored refresh token
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken();
    return !!accessToken;
  } catch {
    return false;
  }
}

// ============================================================================
// OAuth Flow Types
// ============================================================================

interface OAuthResult {
  code: string;
  code_verifier: string;
  redirect_uri: string;
}

// ============================================================================
// Google OAuth Flow (Desktop App with PKCE)
// ============================================================================

/**
 * Start the OAuth flow in the system browser
 * This will open the browser and wait for the user to authenticate
 */
export async function startOAuthFlow(): Promise<OAuthResult> {
  return await invoke<OAuthResult>("start_oauth_flow", { 
    clientId: GOOGLE_CLIENT_ID 
  });
}

/**
 * Cancel any ongoing OAuth flow
 */
export async function cancelOAuthFlow(): Promise<void> {
  try {
    await invoke("cancel_oauth_flow");
  } catch {
    // Ignore
  }
}

/**
 * Exchange authorization code for tokens (PKCE flow)
 */
export async function loginWithGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  deviceInfo?: { os?: string; hostname?: string; appVersion?: string }
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/google/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier,
      redirectUri,
      deviceInfo,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || "Login failed");
  }

  const result = await response.json();
  
  if (!result.success || !result.data) {
    throw new Error("Invalid response from server");
  }

  const { accessToken, refreshToken, user } = result.data;

  // Store tokens and user data securely in OS keyring
  await setAccessToken(accessToken);
  await setRefreshToken(refreshToken);
  await setStoredUser(user);

  return { user, accessToken, refreshToken };
}

/**
 * Login with Google ID token (legacy/web flow - not used in desktop app)
 */
export async function loginWithGoogle(
  idToken: string,
  deviceInfo?: { os?: string; hostname?: string; appVersion?: string }
): Promise<{ user: User; accessToken: string; refreshToken: string }> {
  const response = await fetch(`${AUTH_BASE_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, deviceInfo }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || "Login failed");
  }

  const result = await response.json();
  
  if (!result.success || !result.data) {
    throw new Error("Invalid response from server");
  }

  const { accessToken, refreshToken, user } = result.data;

  // Store tokens and user data securely in OS keyring
  await setAccessToken(accessToken);
  await setRefreshToken(refreshToken);
  await setStoredUser(user);

  return { user, accessToken, refreshToken };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken?: string): Promise<{ accessToken: string; refreshToken: string }> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const token = refreshToken || await getRefreshToken();

    if (!token) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(`${AUTH_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    });

    if (!response.ok) {
      await clearAccessToken();
      await clearRefreshToken();
      await clearStoredUser();
      throw new Error("Session expired. Please log in again.");
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error("Invalid response from server");
    }

    const { accessToken, refreshToken: newRefreshToken } = result.data;

    await setAccessToken(accessToken);
    await setRefreshToken(newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken };
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

interface JwtPayload {
  exp?: number;
}

function isTokenExpired(token: string, bufferSeconds = ACCESS_TOKEN_REFRESH_BUFFER_SECONDS): boolean {
  const payload = parseJwtPayload(token) as JwtPayload | null;

  if (!payload?.exp) {
    return true;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowInSeconds + bufferSeconds;
}

async function getValidAccessToken(): Promise<string | null> {
  const accessToken = await getAccessToken();

  if (accessToken && !isTokenExpired(accessToken)) {
    return accessToken;
  }

  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    if (accessToken) {
      await clearAccessToken();
    }
    return null;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  return refreshed.accessToken;
}

/**
 * Logout - clears tokens and revokes session
 */
export async function logout(): Promise<void> {
  const accessToken = await getValidAccessToken().catch(() => null);
  
  // Try to revoke session on server
  if (accessToken) {
    try {
      await fetch(`${AUTH_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Ignore server errors, still clear local tokens
    }
  }

  // Clear all stored auth data from OS keyring
  await clearAccessToken();
  await clearRefreshToken();
  await clearStoredUser();
}

/**
 * Get active sessions for session management
 */
export async function getActiveSessions(): Promise<{ sessions: SessionInfo[]; currentSessionId: string }> {
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${AUTH_BASE_URL}/auth/sessions`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch sessions");
  }

  const result = await response.json();
  
  if (!result.success || !result.data) {
    throw new Error("Invalid response from server");
  }

  const { sessions, currentSessionId } = result.data;
  
  return {
    sessions: sessions.map((s: any) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    })),
    currentSessionId,
  };
}

/**
 * Revoke a specific session (remote logout)
 */
export async function revokeSession(sessionId: string): Promise<void> {
  const accessToken = await getValidAccessToken();
  
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${AUTH_BASE_URL}/auth/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to revoke session");
  }
}

/**
 * Parse JWT token to get user info (client-side only, not for auth)
 */
export function parseJwtPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// ============================================================================
// Auth Headers Helper (for API calls)
// ============================================================================

/**
 * Get authentication headers for API requests.
 * Retrieves access token from OS keyring.
 * 
 * Usage:
 * ```
 * const headers = await getAuthHeaders();
 * fetch(url, { headers });
 * ```
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const accessToken = await getValidAccessToken().catch(() => null);
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return headers;
}
