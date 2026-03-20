import { SystemHealthContext } from "@/contexts/SystemHealthContext";
import React, { useEffect, useState } from "react";

import {
  checkDaemonHealth,
  onDaemonConnectionStateChange,
  waitForDaemonHealthy,
} from "@/api/base";
import { invoke } from "@tauri-apps/api/core";
import { isDesktopProductionMode } from "@/lib/runtimeMode";

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
      await invoke("start_daemon", { isDev: !isDesktopProductionMode() });
      await waitForDaemonHealthy(30000);
      setIsError(false);
      setError("");
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
      await invoke("stop_daemon", { isDev: !isDesktopProductionMode() });
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
    const unsubscribe = onDaemonConnectionStateChange((state) => {
      setIsRunning(state.status === "connected");
      setLastBeat(state.lastHealthyAt);
    });

    void checkDaemonHealth();

    return () => {
      unsubscribe();
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
