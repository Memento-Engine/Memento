import fs from "fs/promises";

import type { PortReader } from "./connection.js";

export class NodePortReader implements PortReader {
  constructor(
    private readonly resolveFilePath: (portFileName: string) => string,
  ) {}

  async readPort(portFileName: string): Promise<number> {

    console.log("cALLED Node Port reader", portFileName);


    const fileNamesToTry = new Set<string>([portFileName]);
    if (portFileName.endsWith(".port")) {
      fileNamesToTry.add(portFileName.slice(0, -5));
    } else {
      fileNamesToTry.add(`${portFileName}.port`);
    }

    let content: string | null = null;
    let readError: unknown;

    for (const candidateFileName of fileNamesToTry) {
      try {
        content = await fs.readFile(this.resolveFilePath(candidateFileName), "utf-8");
        break;
      } catch (error) {
        readError = error;
      }
    }

    if (content === null) {
      throw readError instanceof Error ? readError : new Error(`Unable to read port file for ${portFileName}`);
    }

    const port = Number.parseInt(content.trim(), 10);

    if (Number.isNaN(port)) {
      throw new Error(`Invalid port in ${portFileName}`);
    }

    return port;
  }
}