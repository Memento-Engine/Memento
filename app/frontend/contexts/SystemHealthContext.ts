import { createContext } from "react";

interface SystemHealthContext {
  isRunning: boolean;
  lastHeartBeat: string;
  checkHealth: () => Promise<boolean>;
  reconnect: () => Promise<void>;
  isError: boolean;
  isMementoDaemonLoading: boolean;
  error: string;
  startMementoDaemon : () => Promise<void>,
  stopMementoDaemon : () => Promise<void>
}

const SystemHealthContextDefaults = (): SystemHealthContext => {
  return {
    isRunning: false,
    lastHeartBeat: "",
    checkHealth: async () => false,
    reconnect: async () => {},
    startMementoDaemon : async () => {},
    stopMementoDaemon : async () => {},
    isError: false,
    error: "",
    isMementoDaemonLoading: false,
  };
};

export const SystemHealthContext = createContext<SystemHealthContext>(
  SystemHealthContextDefaults(),
);
