/**
 * Shortcuts Configuration
 * Centralized shortcut definitions based on platform capabilities
 */

import { ShortcutAction, type ShortcutMap } from "./types";

/**
 * Platform-specific shortcut mappings
 * Uses alternate bindings for web to avoid browser conflicts
 */
export const PlatformShortcuts: ShortcutMap = {
  // Toggle sidebar - same on both platforms (no browser conflict)
  [ShortcutAction.NEW_CHAT]: {
    key: "o",
    ctrlKey: true,
    shiftKey: true,
  },

  [ShortcutAction.SEARCH_MEMORIES]: {
    key: "m",
    ctrlKey: true,
  },
};
