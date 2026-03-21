import { DAEMON_PORT_FILE, PREFERRED_DAEMON_PORT } from "@shared/config/fileConfig";
import { getPortFilePath } from "@shared/config/mementoPaths";
import { PortUrlResolver } from "@shared/daemon/connection";
import { NodePortReader } from "@shared/daemon/nodePortReader";
import { isDevelopmentMode } from "./config";

const daemonResolver = new PortUrlResolver(new NodePortReader((portFileName) =>
  getPortFilePath(portFileName, !isDevelopmentMode())), {
  portFileName: DAEMON_PORT_FILE,
  buildUrl: (port: number) => `http://127.0.0.1:${port}/api/v1`,
  preferredPort: PREFERRED_DAEMON_PORT,
  healthPath: "/healthz",
  initialBackoffMs: 300,
  maxBackoffMs: 5000,
  healthyPollMs: 5000,
});

daemonResolver.startMonitoring();

async function ensureResolver(): Promise<void> {
  await daemonResolver.initialize();
}

export async function getDaemonBaseUrl(): Promise<string> {
  await ensureResolver();
  return daemonResolver.getUrl();
}

export async function waitForDaemonHealthy(timeoutMs = 30000): Promise<string> {
  await ensureResolver();
  return daemonResolver.waitForHealthy(timeoutMs);
}

export async function getSearchToolUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/search_tool`;
}

export async function getSearchResultsByChunkIdsUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/search_results_by_chunk_ids`;
}

export async function getSqlExecuteUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/sql_execute`;
}

export async function getSemanticSearchUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/semantic_search`;
}

export async function getHybridSearchUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/hybrid_search`;
}

export async function getChatMessagesUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/chat/messages`;
}

export async function getChatMessagesListUrl(): Promise<string> {
  return `${await getDaemonBaseUrl()}/chat/messages/list`;
}