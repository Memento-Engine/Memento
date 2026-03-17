import { SystemHealthContext } from "@/contexts/SystemHealthContext";
import React, { useEffect, useState } from "react";

import { checkDaemonHealth, onDaemonStatusChange, DaemonStatus } from "@/api/base";
import { invoke } from "@tauri-apps/api/core";

interface SystemHealthProviderProps {
  children: React.ReactNode;
}
export default function SystemHealthProvider({
  children,
}: SystemHealthProviderProps): React.ReactElement {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [isMementoDaemonLoading, setIsMementoDaemonLoading] =
    useState<boolean>(false);
  const [lastHeartBeat, setLastBeat] = useState<string>("");

  // start the memento daemon process
  const startMementoDaemon = async (): Promise<void> => {
    try {
      setIsMementoDaemonLoading(true);
      const ans = await invoke("start_daemon", { isDev: true });
      setIsError(false);
      setError("");
      // Check health after starting
      setTimeout(() => checkDaemonHealth(), 1000);
    } catch (err) {
      console.log("Command hit got error", err);
      setIsError(true);
      setError(String(err));
    } finally {
      setIsMementoDaemonLoading(false);
    }
  };

  // stop the memento daemon process
  const stopMementoDaemon = async (): Promise<void> => {
    try {
      setIsMementoDaemonLoading(true);
      const ans = await invoke("stop_daemon", { isDev: true });
      setIsError(false);
      setError("");
      setIsRunning(false);
    } catch (err) {
      console.log("Command hit got error", err);
      setIsError(true);
      setError(String(err));
    } finally {
      setIsMementoDaemonLoading(false);
    }
  };

  const checkHealth = async (): Promise<boolean> => {
    // Use the non-blocking health check from base.ts
    return checkDaemonHealth();
  };

  const reconnect = async (): Promise<void> => {
    await checkDaemonHealth();
  };

  useEffect(() => {
    // Subscribe to daemon status changes (non-blocking)
    const unsubscribe = onDaemonStatusChange((status: DaemonStatus) => {
      setIsRunning(status === "connected");
    });

    // Initial health check (non-blocking)
    checkDaemonHealth();

    // Periodic health check every 5 seconds
    const interval = setInterval(() => {
      checkDaemonHealth();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <SystemHealthContext.Provider
      value={{
        stopMementoDaemon,
        startMementoDaemon,
        checkHealth,
        isRunning,
        lastHeartBeat,
        reconnect,
        error,
        isError,
        isMementoDaemonLoading,
      }}
    >
      {children}
    </SystemHealthContext.Provider>
  );
}
