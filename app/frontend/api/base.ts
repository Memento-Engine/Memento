import { readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import {
  AGENTS_PORT_FILE,
  DAEMON_PORT_FILE,
  PREFERRED_AGENT_PORT,
  PREFERRED_DAEMON_PORT,
} from "@shared/config/fileConfig";
import {
  PortReader,
  PortUrlResolver,
  ServiceConnectionState,
  ServiceConnectionStatus,
} from "@shared/daemon/connection";

class TauriPortReaderImpl implements PortReader {
  constructor(private readonly portFileName: string) {}

  async readPort(): Promise<number> {
    let content: string | null = null;
    const fileNamesToTry = new Set<string>([this.portFileName]);
    if (this.portFileName.endsWith(".port")) {
      fileNamesToTry.add(this.portFileName.slice(0, -5));
    } else {
      fileNamesToTry.add(`${this.portFileName}.port`);
    }

    // Try to read port file
    // On Windows: Always use ProgramData (shared between service and user apps)
    // On other platforms: Use LocalAppData
    const isWindows = navigator.platform.toLowerCase().includes("win");

    const tryProgramDataPath = async (fileName: string): Promise<string | null> => {
      try {
        const sharedPath = `C:\\ProgramData\\memento\\ports\\${fileName}`;
        return await readTextFile(sharedPath);
      } catch {
        return null;
      }
    };

    const tryLocalAppDataPath = async (fileName: string): Promise<string | null> => {
      try {
        return await readTextFile(`memento/ports/${fileName}`, {
          baseDir: BaseDirectory.LocalData,
        });
      } catch {
        return null;
      }
    };

    // Try locations based on platform
    for (const candidateFileName of fileNamesToTry) {
      if (isWindows) {
        // Windows: Always use ProgramData (shared with Windows Service)
        content = await tryProgramDataPath(candidateFileName);
      } else {
        // Non-Windows: use LocalAppData
        content = await tryLocalAppDataPath(candidateFileName);
      }

      if (content) {
        break;
      }
    }

    if (content === null) {
      throw new Error(`Unable to read port file for ${this.portFileName}`);
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
    preferredPort: PREFERRED_DAEMON_PORT,
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
    preferredPort: PREFERRED_AGENT_PORT,
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
  console.log("Came this waitfor daemon healty")

  if (!isBrowserRuntime()) {
    console.log("Not in browser runtime, returning fallback URL");
    return "http://localhost:9090/api/v1";
  }
  console.log("Ensuring daemon resolver");
  const resolver = await ensureDaemonResolver();

  console.log("Waiting for daemon to be healthy with timeout", resolver.getUrl(), resolver.getState());

  return resolver.waitForHealthy(timeoutMs);
}

export const AI_GATEWAY_BASE_URL = `http://localhost:4180/v1`;