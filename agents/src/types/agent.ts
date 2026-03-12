/**
 * Core agent types and interfaces.
 */

export type { AgentRequest, AgentResponse } from "../../../shared/types/agent";

/**
 * A source retrieved from search results.
 * chunk_id is required for citation markers in the final answer.
 */
export interface RetrievedSource {
  /** Unique chunk identifier (format: "chunk_123"). Required for citations. */
  chunk_id: string;
  /** The raw text content extracted via OCR */
  text_content: string;
  /** JSON with position/layout data from OCR */
  text_json?: string;
  /** Normalized text layout for rendering */
  normalized_text_layout?: NormalizedTextLayout;
  /** Application name (e.g., "Chrome", "VS Code") */
  app_name: string;
  /** Window title */
  window_title: string;
  /** Browser URL if applicable */
  browser_url: string;
  /** When the frame was captured (ISO string) */
  captured_at: string;
  /** Path to the screenshot image */
  image_path: string;
  /** Frame ID from database */
  frame_id?: number;
  /** Window position X */
  window_x?: number;
  /** Window position Y */
  window_y?: number;
  /** Window width */
  window_width?: number;
  /** Window height */
  window_height?: number;
}

/**
 * Normalized OCR text layout for rendering overlays.
 */
export interface NormalizedTextLayout {
  normalized_text: string;
  elements?: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface ExecutionMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  stepCount: number;
  completedSteps: number;
  failedSteps: number;
}

export interface WorkflowContext {
  requestId: string;
  goal: string;
  startTime: number;
}
