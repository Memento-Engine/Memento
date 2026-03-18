/**
 * User Preferences Storage
 * 
 * Stores user preferences locally using localStorage.
 * For authenticated users, preferences can optionally be synced to the server.
 */

import type { UserPreferences } from "@/contexts/authContext";

const PREFERENCES_KEY = "memento-user-preferences";

/**
 * Default preferences for new users
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  notifications: true,
  autoCapture: true,
  captureInterval: 5, // 5 seconds
  privacyMode: false,
  excludedApps: [],
};

/**
 * Load preferences from localStorage
 */
export function loadPreferences(): UserPreferences {
  if (typeof localStorage === "undefined") {
    return DEFAULT_PREFERENCES;
  }
  
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (!stored) {
      return DEFAULT_PREFERENCES;
    }
    
    const parsed = JSON.parse(stored);
    // Merge with defaults to handle new preference fields
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save preferences to localStorage
 */
export function savePreferences(preferences: UserPreferences): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
}

/**
 * Update specific preference fields
 */
export function updatePreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K]
): UserPreferences {
  const current = loadPreferences();
  const updated = { ...current, [key]: value };
  savePreferences(updated);
  return updated;
}

/**
 * Clear all stored preferences (for logout)
 */
export function clearPreferences(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(PREFERENCES_KEY);
}

// Note: User data storage has been moved to auth.ts using OS keyring for security.
// Access it via getStoredUser/setStoredUser/clearStoredUser from auth.ts.
