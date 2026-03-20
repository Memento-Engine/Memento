/**
 * Session management for chat persistence.
 * Sessions are identified by UUIDs and stored in localStorage.
 */

const SESSION_KEY = "memento-session-id";

/**
 * Generate a new session ID (UUID v4).
 */
export function generateSessionId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get the current session ID from localStorage.
 * Returns null if no session exists.
 */
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

/**
 * Get or create a session ID.
 * Creates a new one if none exists.
 */
export function getOrCreateSessionId(): string {
  const existing = getSessionId();
  if (existing) return existing;
  
  const newId = generateSessionId();
  setSessionId(newId);
  return newId;
}

/**
 * Set the session ID in localStorage.
 */
export function setSessionId(sessionId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, sessionId);
}

/**
 * Clear the session ID (start a new conversation).
 */
export function clearSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Start a new session - clears existing and creates a new one.
 * Returns the new session ID.
 */
export function startNewSession(): string {
  clearSessionId();
  return getOrCreateSessionId();
}
