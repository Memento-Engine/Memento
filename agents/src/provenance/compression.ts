/**
 * Compression Utilities
 * 
 * Compress raw step results into summaries for passing between steps.
 * Maintains key information while drastically reducing token count.
 */

import {
  ProvenanceRow,
  ProvenanceSummary,
  CompressedStepOutput,
} from "./registry";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AppAggregate {
  count: number;
  top_titles: string[];
  sample_urls?: string[];
}

interface TimeRange {
  start: string;
  end: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPRESSION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate rows by app_name
 */
function aggregateByApp(rows: ProvenanceRow[]): Record<string, AppAggregate> {
  const byApp: Record<string, {
    count: number;
    titles: Map<string, number>;
    urls: Set<string>;
  }> = {};

  for (const row of rows) {
    const appName = String(row.app_name ?? "Unknown");
    
    if (!byApp[appName]) {
      byApp[appName] = { count: 0, titles: new Map(), urls: new Set() };
    }

    byApp[appName].count++;

    // Track window titles with frequency
    const title = String(row.window_title ?? "");
    if (title) {
      const currentCount = byApp[appName].titles.get(title) ?? 0;
      byApp[appName].titles.set(title, currentCount + 1);
    }

    // Track URLs
    const url = row.browser_url;
    if (typeof url === "string" && url) {
      byApp[appName].urls.add(url);
    }
  }

  // Convert to output format
  const result: Record<string, AppAggregate> = {};
  
  for (const [appName, data] of Object.entries(byApp)) {
    // Get top 3 titles by frequency
    const sortedTitles = Array.from(data.titles.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([title]) => truncateText(title, 50));

    result[appName] = {
      count: data.count,
      top_titles: sortedTitles,
    };

    if (data.urls.size > 0) {
      result[appName].sample_urls = Array.from(data.urls).slice(0, 3);
    }
  }

  return result;
}

/**
 * Extract time range from rows
 */
function extractTimeRange(rows: ProvenanceRow[]): TimeRange | undefined {
  const timestamps: Date[] = [];

  for (const row of rows) {
    const capturedAt = row.captured_at;
    if (typeof capturedAt === "string") {
      const date = new Date(capturedAt);
      if (!isNaN(date.getTime())) {
        timestamps.push(date);
      }
    }
  }

  if (timestamps.length === 0) return undefined;

  timestamps.sort((a, b) => a.getTime() - b.getTime());

  return {
    start: timestamps[0].toISOString(),
    end: timestamps[timestamps.length - 1].toISOString(),
  };
}

/**
 * Extract key topics/concepts from text content
 */
function extractTopics(rows: ProvenanceRow[], maxTopics: number = 5): string[] {
  const wordFreq: Map<string, number> = new Map();
  
  // Common stop words to filter
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "this",
    "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "what", "which", "who", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "also", "now", "here", "there", "then", "if", "else", "as", "any",
  ]);

  for (const row of rows) {
    const text = String(row.text_content ?? "");
    const title = String(row.window_title ?? "");
    
    // Combine and extract words
    const combined = `${title} ${text}`.toLowerCase();
    const words = combined.match(/\b[a-z]{4,}\b/g) ?? [];

    for (const word of words) {
      if (!stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      }
    }
  }

  // Get top words by frequency
  return Array.from(wordFreq.entries())
    .filter(([_, count]) => count >= 2) // Appear at least twice
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([word]) => word);
}

/**
 * Truncate text to max length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Format time for human readability
 */
function formatTimeForSummary(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPRESSION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compress raw step results into a summary
 */
export function compressStepResults(params: {
  provenanceId: string;
  stepId: string;
  rawData: ProvenanceRow[];
  searchType?: "sql" | "semantic" | "hybrid";
  query?: string;
}): ProvenanceSummary {
  const { provenanceId, stepId, rawData, searchType, query } = params;

  if (rawData.length === 0) {
    return {
      provenance_id: provenanceId,
      step_id: stepId,
      summary: "No results found",
      record_count: 0,
    };
  }

  // Aggregate by app
  const byApp = aggregateByApp(rawData);
  
  // Extract time range
  const timeRange = extractTimeRange(rawData);
  
  // Extract topics
  const topics = extractTopics(rawData);

  // Build human-readable summary
  const summaryParts: string[] = [];
  
  // Record count
  summaryParts.push(`Found ${rawData.length} records`);
  
  // Time range
  if (timeRange) {
    const startFormatted = formatTimeForSummary(timeRange.start);
    const endFormatted = formatTimeForSummary(timeRange.end);
    if (startFormatted !== endFormatted) {
      summaryParts.push(`from ${startFormatted} to ${endFormatted}`);
    } else {
      summaryParts.push(`at ${startFormatted}`);
    }
  }

  // App breakdown
  const appEntries = Object.entries(byApp)
    .sort((a, b) => b[1].count - a[1].count);
  
  if (appEntries.length > 0) {
    const appSummary = appEntries
      .slice(0, 4)
      .map(([app, data]) => {
        const titleHint = data.top_titles.length > 0 
          ? ` (${data.top_titles[0]})` 
          : "";
        return `${app}: ${data.count}${titleHint}`;
      })
      .join(", ");
    
    summaryParts.push(`Apps: ${appSummary}`);
  }

  // Topics
  if (topics.length > 0) {
    summaryParts.push(`Topics: ${topics.slice(0, 5).join(", ")}`);
  }

  // Search context
  if (searchType && query) {
    summaryParts.push(`[${searchType}: "${truncateText(query, 30)}"]`);
  }

  return {
    provenance_id: provenanceId,
    step_id: stepId,
    summary: summaryParts.join(". "),
    record_count: rawData.length,
    by_app: byApp,
    time_range: timeRange,
    topics: topics.length > 0 ? topics : undefined,
  };
}

/**
 * Create compressed output for passing to dependent steps
 */
export function createCompressedOutput(params: {
  provenanceId: string;
  stepId: string;
  rawData: ProvenanceRow[];
  searchType?: "sql" | "semantic" | "hybrid";
  query?: string;
}): CompressedStepOutput {
  const summary = compressStepResults(params);
  
  return {
    provenance_id: params.provenanceId,
    summary,
    chunk_ids_available: params.rawData.length > 0,
  };
}

/**
 * Format multiple step summaries for LLM context
 * Used when building context for dependent steps
 */
export function formatSummariesForContext(
  summaries: ProvenanceSummary[],
): string {
  if (summaries.length === 0) {
    return "No previous step results available.";
  }

  const parts: string[] = ["## Previous Step Results\n"];

  for (const summary of summaries) {
    parts.push(`### ${summary.step_id} (${summary.provenance_id})`);
    parts.push(summary.summary);
    
    if (summary.by_app && Object.keys(summary.by_app).length > 0) {
      parts.push("\nBreakdown by app:");
      for (const [app, data] of Object.entries(summary.by_app)) {
        parts.push(`- ${app}: ${data.count} records`);
        const topTitles = data.top_titles;
        if (topTitles && topTitles.length > 0) {
          parts.push(`  Titles: ${topTitles.join(", ")}`);
        }
      }
    }

    if (summary.extracted_values && Object.keys(summary.extracted_values).length > 0) {
      parts.push("\nExtracted values:");
      for (const [key, value] of Object.entries(summary.extracted_values)) {
        parts.push(`- ${key}: ${JSON.stringify(value)}`);
      }
    }

    parts.push(""); // Empty line between summaries
  }

  return parts.join("\n");
}

/**
 * Estimate token count for a summary (rough approximation)
 */
export function estimateTokenCount(summary: ProvenanceSummary): number {
  const jsonStr = JSON.stringify(summary);
  // Rough estimate: ~4 chars per token
  return Math.ceil(jsonStr.length / 4);
}

/**
 * Check if compression is needed based on data size
 */
export function shouldCompress(rawData: ProvenanceRow[]): boolean {
  // Compress if more than 5 rows or estimated tokens > 500
  if (rawData.length > 5) return true;
  
  const estimatedSize = JSON.stringify(rawData).length;
  return estimatedSize > 2000; // ~500 tokens
}
