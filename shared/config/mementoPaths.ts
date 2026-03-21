import os from "os";
import path from "path";

import { PORT_DIR } from "./fileConfig.js";

export function getMementoBaseDir(): string {
  const platform = os.platform();

  if (platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local", "memento");
  }

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "memento");
  }

  return path.join(os.homedir(), ".local", "share", "memento");
}

/**
 * Get the shared directory for Memento (accessible by both service and user apps).
 * On Windows: Always %PROGRAMDATA%\memento (both dev and production)
 * This ensures Windows Service and user apps access the same data.
 * On other platforms: Same as base dir (dev) or /var/lib/memento (production)
 */
export function getMementoSharedDir(isProduction = false): string {
  const platform = os.platform();
  
  if (platform === "win32") {
    // Windows: Always use ProgramData for shared data (both dev and production)
    // This ensures Windows Service and user apps access the same data
    const programData = process.env.PROGRAMDATA || process.env.ALLUSERSPROFILE || "C:\\ProgramData";
    return path.join(programData, "memento");
  }
  
  if (isProduction) {
    // Non-Windows production: use system-wide directory
    return "/var/lib/memento";
  }
  
  return getMementoBaseDir();
}

export function getPortDir(isProduction = false): string {
  return path.join(getMementoSharedDir(isProduction), PORT_DIR);
}

export function getPortFilePath(fileName: string, isProduction = false): string {
  return path.join(getPortDir(isProduction), fileName);
}