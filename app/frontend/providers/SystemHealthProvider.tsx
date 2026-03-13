import { SystemHealthContext } from "@/contexts/SystemHealthContext";
import React, { useEffect, useState } from "react";

import axios from "axios";
import { getBaseUrl } from "@/api/base";
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
    } catch (err) {
      console.log("Command hit got error", err);
      setIsError(true);
      setError(String(err));
    } finally {
      setIsMementoDaemonLoading(false);
    }
  };

  const checkHealth = async (): Promise<boolean> => {
    const baseUrl = await getBaseUrl();

    if (!baseUrl) {
      return false;
    }

    try {
      const res = await axios.get(`${baseUrl}/healthz`);
      return res.status === 200;
    } catch {
      return false;
    }
  };

  const reconnect = async (): Promise<void> => {
    if (await checkHealth()) {
      return;
    }
  };

  useEffect(() => {
    const runHealthCheck = async () => {
      const status = await checkHealth();
      setIsRunning(status);
    };

    runHealthCheck();

    const interval = setInterval(runHealthCheck, 2000);

    return () => clearInterval(interval);
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
