/**
 * Authentication Provider
 *
 * Manages authentication state, Google OAuth, token refresh, and user preferences.
 * 
 * Desktop App Architecture:
 * - Tokens stored in OS keyring (Windows Credential Manager / macOS Keychain)
 * - User data cached in OS keyring for fast startup
 * - React state maintains runtime auth state
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AuthContext,
  User,
  UserPreferences,
  SessionInfo,
} from "@/contexts/authContext";
import {
  getAccessToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  loginWithGoogleCode,
  startOAuthFlow,
  cancelOAuthFlow,
  logout as apiLogout,
  refreshAccessToken,
  getActiveSessions,
  revokeSession as apiRevokeSession,
  isAuthenticated as checkIsAuthenticated,
  parseJwtPayload,
} from "@/api/auth";
import {
  loadPreferences,
  savePreferences,
  DEFAULT_PREFERENCES,
} from "@/api/preferences";
import { notify } from "@/lib/notify";
import { type, version, hostname } from "@tauri-apps/plugin-os";
import { getVersion } from "@tauri-apps/api/app";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);

  const isAuthenticated = useMemo(() => user !== null, [user]);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      try {
        // Load preferences first (works for both anonymous and authenticated)
        setPreferences(loadPreferences());

        // Load cached user from OS keyring
        const storedUser = await getStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }

        // Validate/refresh authentication
        const authenticated = await checkIsAuthenticated();

        if (authenticated) {
          // Token is valid, load sessions in background
          getActiveSessions()
            .then(({ sessions }) => setActiveSessions(sessions))
            .catch(() => {});
        } else {
          // Not authenticated, clear any stale user data
          setUser(null);
          await clearStoredUser();
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Get device info for session tracking
  const getDeviceInfo = useCallback(async () => {
    try {
      const osType = type();
      const osVersion = version();
      const machineHostname = await hostname();
      const appVersion = await getVersion();

      return {
        os: `${osType} ${osVersion}`,
        hostname: machineHostname || "Unknown",
        appVersion,
      };
    } catch {
      return undefined;
    }
  }, []);

  // Login with Google (using PKCE flow with local callback server)
  const loginWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      // Start OAuth flow - this opens browser and waits for callback
      notify.info("Opening browser for Google Sign-In...");
      
      const oauthResult = await startOAuthFlow();
      
      // Exchange authorization code for tokens
      // This stores tokens and user data in OS keyring
      const deviceInfo = await getDeviceInfo();
      const result = await loginWithGoogleCode(
        oauthResult.code,
        oauthResult.code_verifier,
        oauthResult.redirect_uri,
        deviceInfo
      );

      // Update React state
      setUser(result.user);

      // Load sessions
      try {
        const { sessions } = await getActiveSessions();
        setActiveSessions(sessions);
      } catch {
        // Non-critical, continue
      }

      notify.success(`Welcome, ${result.user.name}!`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to sign in with Google";
      console.error("Google login error:", error);
      notify.error(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [getDeviceInfo]);

  // Logout
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      // apiLogout clears tokens and user data from OS keyring
      await apiLogout();
      setUser(null);
      setActiveSessions([]);
      // Keep preferences (they're device-local)
      notify.success("Signed out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear local state even if server request fails
      setUser(null);
      await clearStoredUser();
      setActiveSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh auth state
  const refreshAuth = useCallback(async () => {
    try {
      await refreshAccessToken();
      // Refresh sessions
      const { sessions } = await getActiveSessions();
      setActiveSessions(sessions);
    } catch (error) {
      // Token refresh failed, user needs to log in again
      setUser(null);
      await clearStoredUser();
      setActiveSessions([]);
    }
  }, []);

  // Update preferences
  const updatePreferences = useCallback(
    async (updates: Partial<UserPreferences>) => {
      const newPrefs = { ...preferences, ...updates };
      setPreferences(newPrefs);
      savePreferences(newPrefs);

      // In the future, sync to server for authenticated users
      // if (isAuthenticated) {
      //   await syncPreferencesToServer(newPrefs);
      // }
    },
    [preferences],
  );

  // Revoke session
  const revokeSession = useCallback(async (sessionId: string) => {
    try {
      await apiRevokeSession(sessionId);
      setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      notify.success("Session revoked");
    } catch (error: any) {
      notify.error(error.message || "Failed to revoke session");
      throw error;
    }
  }, []);

  // Cleanup OAuth on unmount
  useEffect(() => {
    return () => {
      cancelOAuthFlow();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      loginWithGoogle,
      logout,
      refreshAuth,
      preferences,
      updatePreferences,
      activeSessions,
      revokeSession,
    }),
    [
      user,
      isAuthenticated,
      isLoading,
      loginWithGoogle,
      logout,
      refreshAuth,
      preferences,
      updatePreferences,
      activeSessions,
      revokeSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
