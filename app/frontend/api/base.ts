import { readTextFile } from "@tauri-apps/plugin-fs";
import { BaseDirectory } from "@tauri-apps/api/path";

export async function getBaseUrl(): Promise<string> {
  try {
    const port = await readTextFile("memento/memento-daemon.port", {
      baseDir: BaseDirectory.LocalData, // <-- Changed this line
    });

    console.log("Got Port From getBaseUrl:", port);

    return `http://localhost:${port.trim()}/api/v1`;
  } catch (err) {
    console.log("Failed to read port file, using fallback", err);
    return "http://localhost:9090/api/v1";
  }
}