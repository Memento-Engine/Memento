import os from "os";
import path from "path";

import { PORT_DIR } from "./fileConfig.js";

export function getMementoBaseDir(): string {
  const platform = os.platform();

  if (platform === "win32") {
    return path.join(os.homedir(), "AppData", "Local", "Memento");
  }

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Memento");
  }

  return path.join(os.homedir(), ".local", "share", "Memento");
}

/**
 * Get the shared directory for Memento (accessible by both service and user apps).
 * On Windows production: C:\ProgramData\Memento (service writes here)
 * On other platforms or dev: Same as base dir
 */
export function getMementoSharedDir(isProduction: boolean): string {
  const platform = os.platform();
  
  if (platform === "win32" && isProduction) {
    return "C:\\ProgramData\\Memento";
  }
  
  return getMementoBaseDir();
}

export function getPortDir(): string {
  return path.join(getMementoBaseDir(), PORT_DIR);
}

export function getPortFilePath(fileName: string): string {
  return path.join(getPortDir(), fileName);
}