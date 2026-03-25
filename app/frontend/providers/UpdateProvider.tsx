"use client";

import { UpdateContext, UpdateProgress } from "@/contexts/updateContext";
import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { isDesktopProductionMode } from "@/lib/runtimeMode";

interface UpdateProviderProps {
  children: React.ReactNode;
}

interface UpdateAvailablePayload {
  version: string;
}

/** Update check interval: 6 hours (in milliseconds) */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export default function UpdateProvider({
  children,
}: UpdateProviderProps): React.ReactElement {
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Check for updates manually
  const checkForUpdates = useCallback(async (): Promise<void> => {
    // Skip in development/web mode
    if (!isDesktopProductionMode()) {
      console.log("[Update] Skipping update check in development mode");
      return;
    }

    try {
      setIsCheckingUpdate(true);
      const version = await invoke<string | null>("check_for_updates");
      if (version) {
        console.log(`[Update] Update available: ${version}`);
        setAvailableVersion(version);
        setIsDismissed(false);
      } else {
        console.log("[Update] No update available");
      }
    } catch (err) {
      console.error("[Update] Failed to check for updates:", err);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  // Apply the available update
  const applyUpdate = useCallback(async (): Promise<void> => {
    if (!availableVersion) {
      console.warn("[Update] No update available to apply");
      return;
    }

    try {
      setIsApplyingUpdate(true);
      setUpdateProgress({
        stage: "starting",
        percent: 0,
        message: "Starting update...",
      });
      console.log(`[Update] Applying update to version ${availableVersion}...`);
      await invoke("apply_update");
      // App will restart, so we won't reach here normally
    } catch (err) {
      console.error("[Update] Failed to apply update:", err);
      setIsApplyingUpdate(false);
      setUpdateProgress(null);
    }
  }, [availableVersion]);

  // Dismiss the update notification
  const dismissUpdate = useCallback((): void => {
    setIsDismissed(true);
  }, []);

  // Listen for update-available events from the backend
  useEffect(() => {
    // Skip in development/web mode
    if (!isDesktopProductionMode()) {
      return;
    }

    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<UpdateAvailablePayload>(
          "update-available",
          (event) => {
            console.log(`[Update] Received update-available event: ${event.payload.version}`);
            setAvailableVersion(event.payload.version);
            setIsDismissed(false);
          }
        );
      } catch (err) {
        console.error("[Update] Failed to setup update listener:", err);
      }
    }

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Listen for update progress events
  useEffect(() => {
    // Skip in development/web mode
    if (!isDesktopProductionMode()) {
      return;
    }

    let unlisten: UnlistenFn | null = null;

    const setupProgressListener = async () => {
      try {
        unlisten = await listen<UpdateProgress>(
          "update-progress",
          (event) => {
            console.log(`[Update] Progress: ${event.payload.stage} - ${event.payload.percent}%`);
            setUpdateProgress(event.payload);
          }
        );
      } catch (err) {
        console.error("[Update] Failed to setup progress listener:", err);
      }
    };

    setupProgressListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Initial update check and periodic checks (as backup to backend)
  useEffect(() => {
    // Skip in development/web mode
    if (!isDesktopProductionMode()) {
      return;
    }

    // Initial check after 15 seconds (to let app fully initialize)
    const initialTimeout = setTimeout(() => {
      void checkForUpdates();
    }, 15_000);

    // Periodic checks every 6 hours
    const interval = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [checkForUpdates]);

  return (
    <UpdateContext.Provider
      value={{
        availableVersion,
        isCheckingUpdate,
        isApplyingUpdate,
        updateProgress,
        checkForUpdates,
        applyUpdate,
        dismissUpdate,
        isDismissed,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}
