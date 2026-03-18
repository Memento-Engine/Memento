import { useEffect, useState, useCallback, useRef } from "react";
import {
  subscribeToModelState,
  RealtimeModelState,
  ModelState,
  checkModelsStatus,
} from "@/api/models";

interface UseModelStateOptions {
  /**
   * Whether to subscribe to real-time updates.
   * Set to false if you only need to check status once.
   * @default true
   */
  subscribe?: boolean;
  
  /**
   * Callback when models become unavailable (deleted, corrupted).
   * Useful for showing alerts or redirecting to download page.
   */
  onModelsUnavailable?: () => void;
  
  /**
   * Callback when models become ready.
   * Useful for hiding loading states or enabling features.
   */
  onModelsReady?: () => void;
}

interface UseModelStateReturn {
  /** Current model state from file watcher or null if not yet received */
  state: RealtimeModelState | null;
  
  /** Connection status to SSE stream */
  isConnected: boolean;
  
  /** Whether models are ready for use */
  isReady: boolean;
  
  /** Whether models are downloading */
  isDownloading: boolean;
  
  /** Whether models need to be downloaded */
  needsDownload: boolean;
  
  /** Human-readable status message */
  message: string;
  
  /** Last error from connection, if any */
  error: string | null;
  
  /** Manually refresh state (polls API, doesn't use SSE) */
  refresh: () => Promise<void>;
}

/**
 * React hook for real-time model state monitoring.
 * Subscribes to SSE stream from daemon file watcher.
 * 
 * @example
 * ```tsx
 * function ModelIndicator() {
 *   const { isReady, isDownloading, message } = useModelState({
 *     onModelsUnavailable: () => toast.error("Models were deleted"),
 *   });
 * 
 *   if (isDownloading) return <Spinner />;
 *   if (!isReady) return <DownloadPrompt />;
 *   return <GreenCheckmark />;
 * }
 * ```
 */
export function useModelState(options: UseModelStateOptions = {}): UseModelStateReturn {
  const { subscribe = true, onModelsUnavailable, onModelsReady } = options;
  
  const [state, setState] = useState<RealtimeModelState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track previous ready state for callbacks
  const wasReadyRef = useRef<boolean | null>(null);
  
  // Handle state change from SSE
  const handleStateChange = useCallback((newState: RealtimeModelState) => {
    setState(newState);
    setIsConnected(true);
    setError(null);
    
    const isNowReady = newState.status === "ready";
    const wasReady = wasReadyRef.current;
    
    // Fire callbacks on state transitions
    if (wasReady !== null) {
      if (wasReady && !isNowReady) {
        onModelsUnavailable?.();
      } else if (!wasReady && isNowReady) {
        onModelsReady?.();
      }
    }
    
    wasReadyRef.current = isNowReady;
  }, [onModelsUnavailable, onModelsReady]);
  
  // Handle connection error
  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    setIsConnected(false);
  }, []);
  
  // Manual refresh via API
  const refresh = useCallback(async () => {
    try {
      const status = await checkModelsStatus();
      // Convert API response to RealtimeModelState format
      const newState: RealtimeModelState = {
        status: status.status,
        embedding_exists: status.embedding_exists,
        cross_encoder_exists: status.cross_encoder_exists,
        message: status.message,
        updated_at: Date.now() / 1000,
      };
      handleStateChange(newState);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to check model status");
    }
  }, [handleStateChange]);
  
  // Subscribe to SSE stream
  useEffect(() => {
    if (!subscribe) {
      // If not subscribing, do a one-time fetch
      refresh();
      return;
    }
    
    const unsubscribe = subscribeToModelState(handleStateChange, handleError);
    
    return () => {
      unsubscribe();
    };
  }, [subscribe, handleStateChange, handleError, refresh]);
  
  // Derived state helpers
  const isReady = state?.status === "ready";
  const isDownloading = state?.status === "downloading";
  const needsDownload = state?.status === "not_downloaded" || state?.status === "partial_download";
  const message = state?.message ?? "Checking model status...";
  
  return {
    state,
    isConnected,
    isReady,
    isDownloading,
    needsDownload,
    message,
    error,
    refresh,
  };
}

/**
 * Helper to get a user-friendly label for model state.
 */
export function getModelStateLabel(status: ModelState): string {
  switch (status) {
    case "ready":
      return "Models ready";
    case "downloading":
      return "Downloading...";
    case "not_downloaded":
      return "Not downloaded";
    case "partial_download":
      return "Partial download";
    case "downloaded_not_loaded":
      return "Needs restart";
    case "corrupted":
      return "Corrupted";
    default:
      return "Unknown";
  }
}

/**
 * Helper to get a variant/color for model state UI.
 */
export function getModelStateVariant(status: ModelState): "success" | "warning" | "error" | "default" {
  switch (status) {
    case "ready":
      return "success";
    case "downloading":
      return "default";
    case "not_downloaded":
    case "partial_download":
    case "downloaded_not_loaded":
      return "warning";
    case "corrupted":
      return "error";
    default:
      return "default";
  }
}
