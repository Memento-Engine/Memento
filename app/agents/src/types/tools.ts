import { z } from "zod";
import { ToolError } from "./errors";
import type { AuthHeaders } from "../llm/routing";

// Shared types - inlined to avoid cross-project imports in desktop app
export interface ToolContext {
  requestId: string;
  stepId: string;
  attemptNumber: number;
  timeout: number;
  authHeaders?: AuthHeaders;
}

export interface ToolResultError {
  code?: string;
  message: string;
  stage?: string;
  details?: string;
}

export type ToolResultErrorLike = string | ToolResultError;

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: ToolResultErrorLike;
  metadata?: Record<string, any>;
}

/**
 * Base interface for all tools.
 * Tools must be registered and implement this interface.
 */
export interface Tool<TInput = any, TOutput = any> {
  /**
   * Unique identifier for the tool.
   */
  name: string;

  /**
   * Human-readable description.
   */
  description: string;

  /**
   * Zod schema for input validation.
   */
  inputSchema: z.ZodSchema<TInput>;

  /**
   * Optional schema for output validation.
   */
  outputSchema?: z.ZodSchema<TOutput>;

  /**
   * Execute the tool with validated input.
   */
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}

/**
 * Tool factory for creating tool instances.
 */
export interface ToolFactory {
  createSearchTool(): Tool<any, any[]>;
}

/**
 * Tool registry for registration and lookup.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getOrThrow(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolError(`Tool not found: ${name}`, { tool: name });
    }
    return tool;
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

/**
 * Create a tool result indicating success.
 */
export function toolSuccess<T>(data: T, metadata?: Record<string, any>): ToolResult<T> {
  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Create a tool result indicating failure.
 */
export function toolFailure(error: string, metadata?: Record<string, any>): ToolResult {
  return {
    success: false,
    error,
    metadata,
  };
}
