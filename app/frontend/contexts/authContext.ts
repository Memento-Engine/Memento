import { createContext } from "react";

/**
 * User object for authenticated users
 */
export interface User {
  id: string;
  name: string;
  email: string;
  plan: "free" | "premium";
  picture?: string;
}

/**
 * User preferences that can be saved
 */
export interface UserPreferences {
  theme: "light" | "dark" | "system";
  notifications: boolean;
  autoCapture: boolean;
  captureInterval: number; // in seconds
  privacyMode: boolean;
  excludedApps: string[];
}

/**
 * Auth state and methods
 */
export interface AuthContextType {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Auth methods
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  
  // Preferences
  preferences: UserPreferences;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  
  // Session management
  activeSessions: SessionInfo[];
  revokeSession: (sessionId: string) => Promise<void>;
}

export interface SessionInfo {
  id: string;
  deviceOs: string | null;
  deviceHostname: string | null;
  appVersion: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  isCurrent: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
