import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { AGENTS_PORT_FILE, DAEMON_PORT_FILE } from "@shared/config/fileConfig";
import {
  PortReader,
  PortUrlResolver,
  ServiceConnectionState,
  ServiceConnectionStatus,
} from "@shared/daemon/connection";
import { isDesktopProductionMode } from "../lib/runtimeMode";

class TauriPortReaderImpl implements PortReader {
  constructor(private readonly portFileName: string) {}

  async readPort(): Promise<number> {
    let content: string;
    
    // In production on Windows, read from shared ProgramData directory
    // This is where the Windows service writes the port file
    const isProduction = isDesktopProductionMode();
    const isWindows = navigator.platform.toLowerCase().includes("win");
    
    if (isProduction && isWindows) {
      // Read from C:\ProgramData\Memento\ports\<portFile>
      const sharedPath = `C:\\ProgramData\\Memento\\ports\\${this.portFileName}`;
      content = await readTextFile(sharedPath);
    } else {
      // Development: read from user's local app data
      content = await readTextFile(`memento/ports/${this.portFileName}`, {
        baseDir: BaseDirectory.LocalData,
      });
    }
    
    const port = Number.parseInt(content.trim(), 10);

    if (Number.isNaN(port)) {
      throw new Error(`Invalid port in ${this.portFileName}`);
    }

    return port;
  }
}

export type DaemonStatus = ServiceConnectionStatus;

let daemonUrlResolver: PortUrlResolver | null = null;
let agentUrlResolver: PortUrlResolver | null = null;

function createDaemonResolver(): PortUrlResolver {
  return new PortUrlResolver(new TauriPortReaderImpl(DAEMON_PORT_FILE), {
    portFileName: DAEMON_PORT_FILE,
    buildUrl: (port: number) => `http://127.0.0.1:${port}/api/v1`,
    healthPath: "/healthz",
    initialBackoffMs: 300,
    maxBackoffMs: 5000,
    healthyPollMs: 5000,
    fallbackUrl: "http://localhost:7070/api/v1",
  });
}

function createAgentResolver(): PortUrlResolver {
  return new PortUrlResolver(new TauriPortReaderImpl(AGENTS_PORT_FILE), {
    portFileName: AGENTS_PORT_FILE,
    buildUrl: (port: number) => `http://127.0.0.1:${port}/api/v1`,
    healthPath: "/healthz",
    initialBackoffMs: 300,
    maxBackoffMs: 5000,
    healthyPollMs: 5000,
    fallbackUrl: "http://localhost:4170/api/v1",
  });
}

async function ensureDaemonResolver(): Promise<PortUrlResolver> {
  if (!daemonUrlResolver) {
    daemonUrlResolver = createDaemonResolver();
    daemonUrlResolver.startMonitoring();
  }

  await daemonUrlResolver.initialize();
  return daemonUrlResolver;
}

async function ensureAgentResolver(): Promise<PortUrlResolver> {
  if (!agentUrlResolver) {
    agentUrlResolver = createAgentResolver();
  }

  await agentUrlResolver.initialize();
  return agentUrlResolver;
}

export function getDaemonStatus(): DaemonStatus {
  return daemonUrlResolver?.getState().status ?? "unknown";
}

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

export function onDaemonStatusChange(callback: (status: DaemonStatus) => void): () => void {
  if (!isBrowserRuntime()) {
    callback("unknown");
    return () => {};
  }

  initDaemonConnection();

  if (!daemonUrlResolver) {
    callback("unknown");
    return () => {};
  }

  return daemonUrlResolver.onStateChange((state) => callback(state.status));
}

export function onDaemonConnectionStateChange(
  callback: (state: ServiceConnectionState) => void,
): () => void {
  if (!isBrowserRuntime()) {
    callback({
      status: "unknown",
      url: null,
      port: null,
      lastHealthyAt: "",
      consecutiveFailures: 0,
    });
    return () => {};
  }

  initDaemonConnection();

  if (!daemonUrlResolver) {
    callback({
      status: "unknown",
      url: null,
      port: null,
      lastHealthyAt: "",
      consecutiveFailures: 0,
    });
    return () => {};
  }

  return daemonUrlResolver.onStateChange(callback);
}

export async function checkDaemonHealth(): Promise<boolean> {
  if (!isBrowserRuntime()) {
    return false;
  }

  const resolver = await ensureDaemonResolver();
  return resolver.checkHealth();
}

export function initDaemonConnection(): void {
  if (!isBrowserRuntime()) {
    return;
  }

  if (!daemonUrlResolver) {
    daemonUrlResolver = createDaemonResolver();
    daemonUrlResolver.startMonitoring();
  }

  void daemonUrlResolver.initialize().catch((err) => {
    console.log("Failed to initialize daemon resolver", err);
  });
}

if (isBrowserRuntime()) {
  initDaemonConnection();
}

export async function getBaseUrl(): Promise<string> {
  if (!isBrowserRuntime()) {
    return "http://localhost:9090/api/v1";
  }

  const resolver = await ensureDaemonResolver();
  return resolver.getUrl();
}

export async function getAgentBaseUrl(): Promise<string> {
  if (!isBrowserRuntime()) {
    return "http://localhost:4173/api/v1";
  }

  const resolver = await ensureAgentResolver();
  return resolver.getUrl();
}

export async function getDaemonConnectionState(): Promise<ServiceConnectionState> {
  if (!isBrowserRuntime()) {
    return {
      status: "unknown",
      url: null,
      port: null,
      lastHealthyAt: "",
      consecutiveFailures: 0,
    };
  }

  const resolver = await ensureDaemonResolver();
  return resolver.getState();
}

export async function waitForDaemonHealthy(timeoutMs = 30000): Promise<string> {
  if (!isBrowserRuntime()) {
    return "http://localhost:9090/api/v1";
  }

  const resolver = await ensureDaemonResolver();
  return resolver.waitForHealthy(timeoutMs);
}

export const AI_GATEWAY_BASE_URL = `http://localhost:4180/v1`;