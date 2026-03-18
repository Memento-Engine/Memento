import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/api/path";

// Cached daemon URL - initialized once, reused
let cachedDaemonUrl: string | null = null;
let daemonUrlPromise: Promise<string> | null = null;

// Daemon connection status
export type DaemonStatus = "unknown" | "connected" | "disconnected";
let _daemonStatus: DaemonStatus = "unknown";
const statusListeners: Set<(status: DaemonStatus) => void> = new Set();

export function getDaemonStatus(): DaemonStatus {
  return _daemonStatus;
}

export function onDaemonStatusChange(callback: (status: DaemonStatus) => void): () => void {
  statusListeners.add(callback);
  // Immediately call with current status
  callback(_daemonStatus);
  return () => statusListeners.delete(callback);
}

function setDaemonStatus(status: DaemonStatus) {
  if (_daemonStatus !== status) {
    _daemonStatus = status;
    statusListeners.forEach(cb => cb(status));
  }
}

// Check if daemon is healthy (non-blocking, updates status)
export async function checkDaemonHealth(): Promise<boolean> {
  try {
    const url = await getBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch(`${url}/health`, { 
      signal: controller.signal,
      method: 'GET'
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      setDaemonStatus("connected");
      return true;
    }
  } catch {
    // Silently handle - daemon not available
  }
  setDaemonStatus("disconnected");
  return false;
}

// Initialize daemon URL in background (non-blocking)
export function initDaemonConnection(): void {
  if (daemonUrlPromise) return; // Already initializing
  
  daemonUrlPromise = (async () => {
    try {
      const url = await invoke<string>("get_daemon_url");
      cachedDaemonUrl = url;
      // Check health in background
      checkDaemonHealth();
      return url;
    } catch (err) {
      console.log("Failed to get daemon URL via Tauri, using fallback", err);
      cachedDaemonUrl = "http://localhost:9090/api/v1";
      setDaemonStatus("disconnected");
      return cachedDaemonUrl;
    }
  })();
}

// Start initialization immediately when module loads
initDaemonConnection();

export async function getBaseUrl(): Promise<string> {
  // Return cached URL immediately if available
  if (cachedDaemonUrl) {
    return cachedDaemonUrl;
  }
  
  // Wait for initialization (should be fast since it started at module load)
  if (daemonUrlPromise) {
    return daemonUrlPromise;
  }
  
  // Fallback (shouldn't reach here normally)
  return "http://localhost:9090/api/v1";
}

export async function getAgentBaseUrl(): Promise<string> {
  try {
    // Read from standardized Memento/ports directory
    const port = await readTextFile("Memento/ports/memento-agents.port", {
      baseDir: BaseDirectory.LocalData,
    });

    return `http://localhost:${port.trim()}/api/v1`;
  } catch (err) {
    console.log("Failed to read agent port file, using fallback", err);
    return "http://localhost:4173/api/v1";
  }
}

export const AI_GATEWAY_BASE_URL = `http://localhost:4180/v1`;