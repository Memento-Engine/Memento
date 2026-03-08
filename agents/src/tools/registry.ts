import { Tool, ToolRegistry } from "../types/tools";
import { SearchTool } from "./search";
import { getLogger } from "../utils/logger";

let registryInstance: ToolRegistry | null = null;

/**
 * Initialize the tool registry with built-in tools.
 */
export function initializeToolRegistry(): ToolRegistry {
  if (registryInstance) {
    return registryInstance;
  }

  const logger = getLogger();
  registryInstance = new ToolRegistry();

  // Register built-in tools
  const searchTool = new SearchTool();
  registryInstance.register(searchTool);

  logger.info("Tool registry initialized");

  return registryInstance;
}

/**
 * Get the tool registry instance.
 */
export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    initializeToolRegistry();
  }
  return registryInstance!;
}

/**
 * Register a custom tool.
 */
export function registerTool(tool: Tool): void {
  const registry = getToolRegistry();
  registry.register(tool);
  getLogger().info(`Tool registered: ${tool.name}`);
}
