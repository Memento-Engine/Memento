import { getBaseUrl } from "./base";

export interface CaptureStatus {
  paused: boolean;
  reason: string;
}

export interface PauseResumeResponse {
  success: boolean;
  paused: boolean;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get current daemon capture status
 */
export async function getDaemonCaptureStatus(): Promise<CaptureStatus> {
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
