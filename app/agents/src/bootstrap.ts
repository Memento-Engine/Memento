import fs from "fs";
import path from "path";
import { getMementoSharedDir } from "@shared/config/mementoPaths";

function crashLogPath(): string {
  const sharedDir = getMementoSharedDir(true);
  return path.join(sharedDir, "logs", "agents", "memento-agents-crash.log");
}

function appendCrashLog(message: string, error?: unknown): void {
  try {
    const filePath = crashLogPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const errText = error instanceof Error
      ? `${error.message}\n${error.stack ?? ""}`
      : String(error ?? "unknown error");

    const line = [
      `[${new Date().toISOString()}] ${message}`,
      errText,
      "",
    ].join("\n");

    fs.appendFileSync(filePath, line, "utf8");
  } catch {
    // Avoid recursive failures in crash path.
  }
}

process.on("uncaughtException", (error) => {
  appendCrashLog("uncaughtException", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  appendCrashLog("unhandledRejection", reason);
  process.exit(1);
});

(async () => {
  try {
    await import("./server.js");
  } catch (error) {
    appendCrashLog("Failed while importing server entrypoint", error);
    process.exit(1);
  }
})();
