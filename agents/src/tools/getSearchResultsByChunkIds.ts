import axios from "axios";
import { getConfig } from "../config/config";
import { getLogger } from "../utils/logger";
import { StepSearchResult } from "../../../shared/types/frontend";

export async function getSearchResultsByChunkIds(
  chunkIds: number[],
  requestId: string,
): Promise<StepSearchResult[]> {
  const logger = await getLogger();
  const config = await getConfig();

  if (chunkIds.length === 0) {
    return [];
  }

  try {
    const response = await axios.post<StepSearchResult[]>(
      config.backend.searchResultsByChunkIdsUrl,
      { chunk_ids: chunkIds, include_text_json : false },
      {
        timeout: config.backend.timeout,
        headers: { "Content-Type": "application/json" },
      },
    );

    if (response.status === 200 && Array.isArray(response.data)) {
      logger.info(
        { resultCount: response.data.length, requestId },
        "Successfully fetched search results",
      );
      return response.data;
    }

    logger.warn(
      { status: response.status, data: response.data, requestId },
      "Received unexpected response from search results endpoint",
    );
    return [];
  } catch (error) {
    logger.error(
      { error, requestId },
      "Failed to fetch search results by chunk IDs",
    );
    return [];
  }
}
