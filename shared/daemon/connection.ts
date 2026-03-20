export type ServiceConnectionStatus = "unknown" | "connected" | "disconnected";

export interface ServiceConnectionState {
  status: ServiceConnectionStatus;
  url: string | null;
  port: number | null;
  lastHealthyAt: string;
  consecutiveFailures: number;
}

export interface PortReader {
  readPort(portFileName: string): Promise<number>;
}

export interface PortUrlResolverOptions {
  portFileName: string;
  buildUrl: (port: number) => string;
  healthPath?: string;
  requestTimeoutMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  healthyPollMs?: number;
  fallbackUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 2000;
const DEFAULT_INITIAL_BACKOFF_MS = 300;
const DEFAULT_MAX_BACKOFF_MS = 5000;
const DEFAULT_HEALTHY_POLL_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export class PortUrlResolver {
  private readonly healthPath: string;
  private readonly requestTimeoutMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly healthyPollMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly listeners = new Set<(state: ServiceConnectionState) => void>();

  private state: ServiceConnectionState = {
    status: "unknown",
    url: null,
    port: null,
    lastHealthyAt: "",
    consecutiveFailures: 0,
  };

  private currentBackoffMs: number;
  private initializePromise: Promise<void> | null = null;
  private checkHealthPromise: Promise<boolean> | null = null;
  private monitorPromise: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly portReader: PortReader,
    private readonly options: PortUrlResolverOptions,
  ) {
    this.healthPath = options.healthPath ?? "/healthz";
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.healthyPollMs = options.healthyPollMs ?? DEFAULT_HEALTHY_POLL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.currentBackoffMs = this.initialBackoffMs;
  }

  getState(): ServiceConnectionState {
    return { ...this.state };
  }

  onStateChange(callback: (state: ServiceConnectionState) => void): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => {
      this.listeners.delete(callback);
    };
  }

  async initialize(): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      await this.readCandidateUrl();
      this.startMonitoring();
    })();

    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  startMonitoring(): void {
    if (this.monitorPromise) {
      return;
    }

    this.stopped = false;
    this.monitorPromise = this.monitorLoop().finally(() => {
      this.monitorPromise = null;
    });
  }

  stopMonitoring(): void {
    this.stopped = true;
  }

  async getUrl(): Promise<string> {
    if (this.state.url) {
      return this.state.url;
    }

    const candidate = await this.readCandidateUrl();
    if (candidate) {
      return candidate.url;
    }

    if (this.options.fallbackUrl) {
      return this.options.fallbackUrl;
    }

    throw new Error(`Unable to resolve URL for ${this.options.portFileName}`);
  }

  async checkHealth(): Promise<boolean> {
    if (this.checkHealthPromise) {
      return this.checkHealthPromise;
    }

    this.checkHealthPromise = this.doCheckHealth();

    try {
      return await this.checkHealthPromise;
    } finally {
      this.checkHealthPromise = null;
    }
  }

  async waitForHealthy(timeoutMs = 30000): Promise<string> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const healthy = await this.checkHealth();
      if (healthy) {
        return this.getUrl();
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      await sleep(Math.min(this.currentBackoffMs, remainingMs));
    }

    throw new Error(`Timed out waiting for ${this.options.portFileName} to become healthy`);
  }

  private async monitorLoop(): Promise<void> {
    while (!this.stopped) {
      const healthy = await this.checkHealth();
      const delay = healthy ? this.healthyPollMs : this.currentBackoffMs;
      await sleep(delay);
    }
  }

  private async doCheckHealth(): Promise<boolean> {
    const currentUrl = this.state.url;
    if (currentUrl && (await this.isUrlHealthy(currentUrl))) {
      this.markConnected(currentUrl, this.state.port);
      return true;
    }

    const candidate = await this.readCandidateUrl();
    if (!candidate) {
      this.markDisconnected();
      return false;
    }

    if (await this.isUrlHealthy(candidate.url)) {
      this.markConnected(candidate.url, candidate.port);
      return true;
    }

    this.markDisconnected();
    return false;
  }

  private async readCandidateUrl(): Promise<{ port: number; url: string } | null> {
    try {
      const port = await this.portReader.readPort(this.options.portFileName);
      const url = this.options.buildUrl(port);

      if (this.state.port !== port || this.state.url !== url) {
        this.updateState({
          port,
          url,
        });
      }

      return { port, url };
    } catch {
      return null;
    }
  }

  private async isUrlHealthy(url: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(
        this.fetchImpl,
        `${url}${this.healthPath}`,
        this.requestTimeoutMs,
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private markConnected(url: string, port: number | null): void {
    this.currentBackoffMs = this.initialBackoffMs;
    this.updateState({
      status: "connected",
      url,
      port,
      lastHealthyAt: new Date().toISOString(),
      consecutiveFailures: 0,
    });
  }

  private markDisconnected(): void {
    this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
    this.updateState({
      status: "disconnected",
      url: null,
      port: null,
      consecutiveFailures: this.state.consecutiveFailures + 1,
    });
  }

  private updateState(partial: Partial<ServiceConnectionState>): void {
    const nextState: ServiceConnectionState = {
      ...this.state,
      ...partial,
    };

    const changed =
      nextState.status !== this.state.status ||
      nextState.url !== this.state.url ||
      nextState.port !== this.state.port ||
      nextState.lastHealthyAt !== this.state.lastHealthyAt ||
      nextState.consecutiveFailures !== this.state.consecutiveFailures;

    if (!changed) {
      return;
    }

    this.state = nextState;
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}