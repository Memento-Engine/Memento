import { getBaseUrl } from "./base";

// Types matching the Rust API responses
export interface DirectorySize {
  bytes: number;
  formatted: string;
}

export interface MediaUsage {
  images_count: number;
  images_size: DirectorySize;
}

export interface DatabaseUsage {
  main_db_size: DirectorySize;
  wal_size: DirectorySize;
  total_size: DirectorySize;
}

export interface LogsUsage {
  files_count: number;
  total_size: DirectorySize;
}

export interface CacheUsage {
  total_size: DirectorySize;
}

export interface DiskUsage {
  media: MediaUsage;
  database: DatabaseUsage;
  logs: LogsUsage;
  cache: CacheUsage;
  total_size: DirectorySize;
  base_dir: string;
}

export interface CaptureStatus {
  paused: boolean;
  reason: string;
}

export interface PauseResumeResponse {
  success: boolean;
  paused: boolean;
  message: string;
}

export interface ClearResult {
  success: boolean;
  message: string;
  bytes_cleared: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export type ClearTarget = "cache" | "logs" | "media" | "database" | "all";

/**
 * Get disk usage statistics for all storage categories
 */
export async function getDiskUsage(): Promise<DiskUsage> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/disk_usage`);
  
  if (!response.ok) {
    throw new Error(`Failed to get disk usage: ${response.statusText}`);
  }
  
  const result: ApiResponse<DiskUsage> = await response.json();
  
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to get disk usage");
  }
  
  return result.data;
}

/**
 * Get current capture status (paused or running)
 */
export async function getCaptureStatus(): Promise<CaptureStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/capture/status`);
  
  if (!response.ok) {
    throw new Error(`Failed to get capture status: ${response.statusText}`);
  }
  
  const result: ApiResponse<CaptureStatus> = await response.json();
  
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to get capture status");
  }
  
  return result.data;
}

/**
 * Pause screen capture
 */
export async function pauseCapture(): Promise<PauseResumeResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/capture/pause`, {
    method: "POST",
  });
  
  if (!response.ok) {
    throw new Error(`Failed to pause capture: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Resume screen capture
 */
export async function resumeCapture(): Promise<PauseResumeResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/capture/resume`, {
    method: "POST",
  });
  
  if (!response.ok) {
    throw new Error(`Failed to resume capture: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Clear storage for a specific target
 * For database or all, the daemon will automatically pause capture first
 */
export async function clearStorage(target: ClearTarget): Promise<ClearResult> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/clear`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to clear ${target}: ${response.statusText}`);
  }
  
  const result: ApiResponse<ClearResult> = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || `Failed to clear ${target}`);
  }
  
  return result.data!;
}
