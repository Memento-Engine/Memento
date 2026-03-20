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

export function getPortDir(): string {
  return path.join(getMementoBaseDir(), PORT_DIR);
}

export function getPortFilePath(fileName: string): string {
  return path.join(getPortDir(), fileName);
}