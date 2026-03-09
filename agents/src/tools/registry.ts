import { Tool, ToolRegistry } from "../types/tools";
import { SearchTool } from "./search";
import { getLogger } from "../utils/logger";

let registryInstance: ToolRegistry | null = null;

/**
 * Initialize the tool registry with built-in tools.
 */
export async function initializeToolRegistry(): Promise<ToolRegistry> {
  if (registryInstance) {
    return registryInstance;
  }

  const logger = await getLogger();
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
export async function getToolRegistry(): Promise<ToolRegistry> {
  if (!registryInstance) {
    await initializeToolRegistry();
  }
  return registryInstance!;
}

/**
 * Register a custom tool.
 */
export async function registerTool(tool: Tool): Promise<void> {
  const registry = await getToolRegistry();
  registry.register(tool);
  const logger = await getLogger();
  logger.info(`Tool registered: ${tool.name}`);
}
