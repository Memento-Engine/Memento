import fs from "fs/promises";

import type { PortReader } from "./connection.js";

export class NodePortReader implements PortReader {
  constructor(
    private readonly resolveFilePath: (portFileName: string) => string,
  ) {}

  async readPort(portFileName: string): Promise<number> {
    const content = await fs.readFile(this.resolveFilePath(portFileName), "utf-8");
    const port = Number.parseInt(content.trim(), 10);

    if (Number.isNaN(port)) {
      throw new Error(`Invalid port in ${portFileName}`);
    }

    return port;
  }
}