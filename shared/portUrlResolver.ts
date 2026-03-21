/**
 * Shared port URL resolver for caching and watching port files.
 * Abstracts the port reading and watching mechanism so different runtimes
 * (Node.js, Tauri) can provide their own implementations.
 */

export interface PortReaderImpl {
  readPort(): Promise<number>;
  setupWatcher?(onPortChange: (port: number) => void): Promise<void>;
  cleanup?(): Promise<void>;
}

export interface PortUrlResolverOptions {
  buildUrl(port: number): string;
}

export class PortUrlResolver {
  private cachedPort: number | null = null;
  private portPromise: Promise<number> | null = null;
  private listeners: Set<(url: string) => void> = new Set();
  private impl: PortReaderImpl;
  private options: PortUrlResolverOptions;
  private initialized = false;

  constructor(impl: PortReaderImpl, options: PortUrlResolverOptions) {
    this.impl = impl;
    this.options = options;
  }

  /**
   * Initialize the resolver and set up watching if available
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.cachedPort = await this.impl.readPort();
      // Set up watching in background
      if (this.impl.setupWatcher) {
        this.impl.setupWatcher((newPort) => {
          this.cachedPort = newPort;
          const url = this.options.buildUrl(newPort);
          this.listeners.forEach((cb) => cb(url));
        }).catch((err) => {
          console.error("Failed to setup port watcher:", err);
        });
      }
    } catch (error) {
      console.warn("Failed to read port file:", error);
      this.cachedPort = null;
    }
  }

  /**
   * Get the current URL (cached if available)
   */
  async getUrl(): Promise<string> {
    // Ensure initialization
    if (!this.initialized) {
      if (!this.portPromise) {
        this.portPromise = this.initialize().then(() => this.cachedPort ?? -1);
      }
      await this.portPromise;
    }

    if (this.cachedPort !== null) {
      return this.options.buildUrl(this.cachedPort);
    }

    throw new Error("Port not available");
  }

  /**
   * Subscribe to URL changes
   */
  onUrlChange(callback: (url: string) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.impl.cleanup) {
      await this.impl.cleanup();
    }
    this.listeners.clear();
  }
}
