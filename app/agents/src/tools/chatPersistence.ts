import axios from "axios";
import { getConfig } from "../config/config";
import { getLogger } from "../utils/logger";
import { StepResult } from "../types/stepResult";

interface MessageSourceInput {
  chunk_id: number;
  usage_type: "citation" | "reviewed" | "context";
  step_id?: string;
}

interface SaveMessagePayload {
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: MessageSourceInput[];
}

interface SaveMessageResponse {
  success: boolean;
  message_id: number;
}

interface MessageRow {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

interface GetMessagesResponse {
  success: boolean;
  messages: MessageRow[];
}

function getBaseUrl(searchToolUrl: string): string {
  return searchToolUrl.replace("/api/v1/search_tool", "");
}

/**
 * Save a message + chunk references to the daemon's SQLite DB.
 */
export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources: MessageSourceInput[],
): Promise<number | null> {
  const logger = await getLogger();
  const config = await getConfig();
  const baseUrl = getBaseUrl(config.backend.searchToolUrl);

  try {
    const response = await axios.post<SaveMessageResponse>(
      `${baseUrl}/api/v1/chat/messages`,
      { session_id: sessionId, role, content, sources } satisfies SaveMessagePayload,
      { timeout: 10000, headers: { "Content-Type": "application/json" } },
    );

    if (response.data?.success) {
      logger.info({ messageId: response.data.message_id, sessionId, role, sourceCount: sources.length }, "Message saved to DB");
      return response.data.message_id;
    }

    logger.warn({ response: response.data }, "Failed to save message");
    return null;
  } catch (error) {
    logger.error({ error }, "Error saving message to DB");
    return null;
  }
}

/**
 * Load chat history for a session from DB.
 */
export async function getSessionMessages(
  sessionId: string,
  limit = 50,
): Promise<Array<{ role: string; content: string }>> {
  const logger = await getLogger();
  const config = await getConfig();
  const baseUrl = getBaseUrl(config.backend.searchToolUrl);

  try {
    const response = await axios.post<GetMessagesResponse>(
      `${baseUrl}/api/v1/chat/messages/list`,
      { session_id: sessionId, limit },
      { timeout: 10000, headers: { "Content-Type": "application/json" } },
    );

    if (response.data?.success) {
      return response.data.messages.map(m => ({ role: m.role, content: m.content }));
    }

    return [];
  } catch (error) {
    logger.error({ error }, "Error loading session messages");
    return [];
  }
}

/**
 * Build source references from step results.
 * All evidence chunks are "citation", all read chunks are "reviewed".
 */
export function buildSourcesFromStepResults(
  stepResults: Record<string, StepResult>,
): MessageSourceInput[] {
  const sources: MessageSourceInput[] = [];
  const seen = new Set<string>(); // dedup key: "chunk_id:usage_type:step_id"

  for (const [stepId, result] of Object.entries(stepResults)) {
    // Evidence chunks → citation
    for (const chunkId of result.evidenceChunkIds) {
      const key = `${chunkId}:citation:${stepId}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({ chunk_id: chunkId, usage_type: "citation", step_id: stepId });
      }
    }

    // Fully-read chunks that aren't evidence → reviewed
    for (const chunkId of result.chunksRead) {
      if (!result.evidenceChunkIds.includes(chunkId)) {
        const key = `${chunkId}:reviewed:${stepId}`;
        if (!seen.has(key)) {
          seen.add(key);
          sources.push({ chunk_id: chunkId, usage_type: "reviewed", step_id: stepId });
        }
      }
    }
  }

  return sources;
}
