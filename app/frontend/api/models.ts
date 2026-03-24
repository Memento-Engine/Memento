/**
 * Model management API for onboarding
 * Handles checking model status and downloading models during setup.
 */

import { getBaseUrl } from "./base";

/**
 * Model state enum matching backend ModelState
 */
export type ModelState = 
  | "not_downloaded"      // Models not downloaded - show onboarding download UI
  | "partial_download"    // Models partially downloaded - show download UI with resume
  | "downloaded_not_loaded" // Models exist but not loaded (needs restart)
  | "ready"               // Models downloaded and loaded - fully operational
  | "downloading"         // Models currently being downloaded
  | "corrupted";          // Models exist but appear corrupted

export interface ModelStatus {
  /** Overall status of the models */
  status: ModelState;
  /** Whether all models are downloaded and ready (legacy field) */
  models_ready: boolean;
  /** Whether embedding model files exist on disk */
  embedding_exists: boolean;
  /** Whether models are loaded in memory */
  models_loaded: boolean;
  /** Path where models are stored */
  models_path: string;
  /** User-friendly message explaining current state */
  message: string;
}

export interface ModelDownloadProgress {
  current_model: string;
  progress: number;
  progress_percent: number;
  message: string;
  completed: boolean;
  error: string | null;
}

/**
 * Check if all required ML models are already downloaded
 */
export async function checkModelsStatus(): Promise<ModelStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/models/status`);
  
  if (!response.ok) {
    throw new Error(`Failed to check model status: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Download all required ML models with progress updates via SSE.
 * Call this during onboarding if models are not yet downloaded.
 * 
 * @param onProgress - Callback for progress updates
 * @param onComplete - Callback when download completes
 * @param onError - Callback when an error occurs
 * @returns Cleanup function to abort the download
 */
export function downloadModelsWithProgress(
  onProgress: (progress: ModelDownloadProgress) => void,
  onComplete: () => void,
  onError: (error: string) => void
): () => void {
  let aborted = false;
  let eventSource: EventSource | null = null;
  
  const startDownload = async () => {
    try {
      const baseUrl = await getBaseUrl();
      const url = `${baseUrl}/models/download`;
      
      eventSource = new EventSource(url);
      
      eventSource.onmessage = (event) => {
        if (aborted) return;
        
        try {
          const progress: ModelDownloadProgress = JSON.parse(event.data);
          onProgress(progress);
          
          if (progress.completed) {
            eventSource?.close();
            onComplete();
          }
          
          if (progress.error) {
            eventSource?.close();
            onError(progress.error);
          }
        } catch (e) {
          console.error("Failed to parse progress event:", e);
        }
      };
      
      eventSource.onerror = (error) => {
        if (aborted) return;
        eventSource?.close();
        onError("Connection to download server lost");
      };
    } catch (e) {
      if (!aborted) {
        onError(e instanceof Error ? e.message : "Unknown error");
      }
    }
  };
  
  startDownload();
  
  // Return cleanup function
  return () => {
    aborted = true;
    eventSource?.close();
  };
}

/**
 * Download models synchronously (blocking call, no progress)
 * Use downloadModelsWithProgress for better UX with progress updates.
 */
export async function downloadModelsSync(): Promise<{ success: boolean; message: string }> {
  const baseUrl = await getBaseUrl();
  
  const response = await fetch(`${baseUrl}/models/download`, {
    method: "POST",
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download models: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Real-time model state from file watcher SSE stream.
 * Matches Rust ModelState struct from model_watcher.rs
 */
export interface RealtimeModelState {
  status: ModelState;
  embedding_exists: boolean;
  message: string;
  updated_at: number;
}

/**
 * Subscribe to real-time model state updates via SSE.
 * This receives instant notifications when model files change on disk
 * (e.g., user deletes models, download completes).
 * 
 * @param onStateChange - Callback when model state changes
 * @param onError - Callback when connection error occurs
 * @returns Cleanup function to close the connection
 * 
 * @example
 * ```ts
 * const unsubscribe = subscribeToModelState(
 *   (state) => {
 *     if (state.status === "not_downloaded") {
 *       showDownloadPrompt();
 *     }
 *   },
 *   (error) => console.error(error)
 * );
 * 
 * // Later, when component unmounts:
 * unsubscribe();
 * ```
 */
export function subscribeToModelState(
  onStateChange: (state: RealtimeModelState) => void,
  onError?: (error: string) => void
): () => void {
  let eventSource: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  
  const connect = async () => {
    if (closed) return;
    
    try {
      const baseUrl = await getBaseUrl();
      const url = `${baseUrl}/models/state/stream`;
      
      eventSource = new EventSource(url);
      
      // Handle state update events
      eventSource.addEventListener("state", (event: MessageEvent) => {
        if (closed) return;
        
        try {
          const state: RealtimeModelState = JSON.parse(event.data);
          onStateChange(state);
        } catch (e) {
          console.error("Failed to parse model state event:", e);
        }
      });
      
      // Handle reconnect hints from server
      eventSource.addEventListener("reconnect", () => {
        if (closed) return;
        eventSource?.close();
        scheduleReconnect();
      });
      
      eventSource.onerror = () => {
        if (closed) return;
        eventSource?.close();
        onError?.("Connection to model state stream lost");
        scheduleReconnect();
      };
    } catch (e) {
      if (!closed) {
        onError?.(e instanceof Error ? e.message : "Unknown error");
        scheduleReconnect();
      }
    }
  };
  
  const scheduleReconnect = () => {
    if (closed) return;
    // Reconnect after 3 seconds
    reconnectTimeout = setTimeout(connect, 3000);
  };
  
  // Initial connection
  connect();
  
  // Return cleanup function
  return () => {
    closed = true;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    eventSource?.close();
  };
}
