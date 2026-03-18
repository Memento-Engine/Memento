/**
 * Provenance Registry
 * 
 * Stores raw results indexed by provenance ID.
 * Enables context compression while maintaining citation accuracy.
 * 
 * Key Principles:
 * 1. Raw data stays in registry, never passed between steps
 * 2. Summaries flow forward, keeping context small
 * 3. Chunk IDs tracked via provenance for citation resolution
 * 4. Lineage preserved via parent_provs
 */

import { getLogger } from "../utils/logger";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Derivation type - how this provenance relates to previous steps
 */
export type DerivationType = 
  | "source"       // Original data from database query
  | "narrowing"    // Filtered subset of parent provenance
  | "contextual"   // Informed by parent but searched full database
  | "aggregation"  // Aggregated/summarized from parent data
  | "connection";  // Mapped connections between provenances

/**
 * Raw data row - must include chunk_id
 */
export interface ProvenanceRow {
  chunk_id: number;
  [key: string]: unknown;
}

/**
 * Connection between chunks (for mapping research to code, etc.)
 */
export interface ChunkConnection {
  source_chunk_id: number;
  target_chunk_id: number;
  similarity?: number;
  concept?: string;
}

/**
 * Single provenance entry in the registry
 */
export interface ProvenanceEntry {
  provenance_id: string;
  step_id: string;
  chunk_ids: number[];
  raw_data: ProvenanceRow[];
  
  // Lineage tracking
  parent_provs: string[];
  derivation: DerivationType;
  
  // For connection mappings
  connections?: ChunkConnection[];
  
  // Metadata
  created_at: number;
  search_type?: "sql" | "semantic" | "hybrid";
  query?: string;
  row_count: number;
}

/**
 * Compressed summary for passing between steps
 */
export interface ProvenanceSummary {
  provenance_id: string;
  step_id: string;
  summary: string;
  record_count: number;
  
  // Extracted values for PARAMETER dependencies
  extracted_values?: Record<string, unknown>;
  
  // Aggregated metadata
  by_app?: Record<string, { count: number; top_titles?: string[] }>;
  time_range?: { start: string; end: string };
  topics?: string[];
}

/**
 * Step output that flows to dependent steps
 */
export interface CompressedStepOutput {
  provenance_id: string;
  summary: ProvenanceSummary;
  
  // Flag that registry HAS raw data (but don't pass IDs unless needed)
  chunk_ids_available: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * In-memory provenance registry.
 * One instance per request/session.
 */
export class ProvenanceRegistry {
  private registry: Map<string, ProvenanceEntry> = new Map();
  private counter: number = 0;
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  /**
   * Generate a unique provenance ID
   */
  private generateId(): string {
    this.counter++;
    return `prov_${String(this.counter).padStart(3, "0")}`;
  }

  /**
   * Store raw results and return provenance ID
   */
  store(params: {
    stepId: string;
    rawData: ProvenanceRow[];
    parentProvs?: string[];
    derivation?: DerivationType;
    searchType?: "sql" | "semantic" | "hybrid";
    query?: string;
    connections?: ChunkConnection[];
  }): string {
    const provId = this.generateId();
    
    // Extract chunk_ids from raw data
    const chunkIds = params.rawData
      .map(row => row.chunk_id)
      .filter((id): id is number => typeof id === "number");

    const entry: ProvenanceEntry = {
      provenance_id: provId,
      step_id: params.stepId,
      chunk_ids: chunkIds,
      raw_data: params.rawData,
      parent_provs: params.parentProvs ?? [],
      derivation: params.derivation ?? "source",
      connections: params.connections,
      created_at: Date.now(),
      search_type: params.searchType,
      query: params.query,
      row_count: params.rawData.length,
    };

    this.registry.set(provId, entry);
    return provId;
  }

  /**
   * Get a provenance entry by ID
   */
  get(provId: string): ProvenanceEntry | undefined {
    return this.registry.get(provId);
  }

  /**
   * Get chunk_ids for a provenance (for filtering in dependent steps)
   */
  getChunkIds(provId: string): number[] {
    const entry = this.registry.get(provId);
    return entry?.chunk_ids ?? [];
  }

  /**
   * Get chunk_ids from multiple provenances (union)
   */
  getChunkIdsFromMultiple(provIds: string[]): number[] {
    const allIds = new Set<number>();
    for (const provId of provIds) {
      const ids = this.getChunkIds(provId);
      ids.forEach(id => allIds.add(id));
    }
    return Array.from(allIds);
  }

  /**
   * Get raw data for a provenance (for explicit fetch by LLM)
   */
  getRawData(provId: string, options?: {
    limit?: number;
    fields?: string[];
  }): ProvenanceRow[] {
    const entry = this.registry.get(provId);
    if (!entry) return [];

    let data = entry.raw_data;

    // Apply field filtering if specified
    if (options?.fields && options.fields.length > 0) {
      data = data.map(row => {
        const filtered: ProvenanceRow = { chunk_id: row.chunk_id };
        for (const field of options.fields!) {
          if (field in row) {
            filtered[field] = row[field];
          }
        }
        return filtered;
      });
    }

    // Apply limit
    if (options?.limit && options.limit < data.length) {
      data = data.slice(0, options.limit);
    }

    return data;
  }

  /**
   * Get all provenances for a step (may have multiple from retries)
   */
  getByStepId(stepId: string): ProvenanceEntry[] {
    return Array.from(this.registry.values())
      .filter(entry => entry.step_id === stepId);
  }

  /**
   * Get all chunk_ids across all provenances (for final citation)
   */
  getAllChunkIds(): number[] {
    const allIds = new Set<number>();
    for (const entry of this.registry.values()) {
      entry.chunk_ids.forEach(id => allIds.add(id));
    }
    return Array.from(allIds);
  }

  /**
   * Resolve citations: given provenance IDs, get all associated chunk_ids
   */
  resolveCitations(provIds: string[]): Map<string, number[]> {
    const result = new Map<string, number[]>();
    for (const provId of provIds) {
      const entry = this.registry.get(provId);
      if (entry) {
        result.set(provId, entry.chunk_ids);
      }
    }
    return result;
  }

  /**
   * Get lineage for a provenance (trace back to source)
   */
  getLineage(provId: string): string[] {
    const lineage: string[] = [provId];
    const visited = new Set<string>([provId]);
    const queue = [provId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const entry = this.registry.get(current);
      if (entry) {
        for (const parentId of entry.parent_provs) {
          if (!visited.has(parentId)) {
            visited.add(parentId);
            lineage.push(parentId);
            queue.push(parentId);
          }
        }
      }
    }

    return lineage;
  }

  /**
   * Get all entries (for debugging/logging)
   */
  list(): ProvenanceEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get statistics
   */
  stats(): {
    entryCount: number;
    totalChunks: number;
    totalRows: number;
  } {
    let totalChunks = 0;
    let totalRows = 0;
    for (const entry of this.registry.values()) {
      totalChunks += entry.chunk_ids.length;
      totalRows += entry.row_count;
    }
    return {
      entryCount: this.registry.size,
      totalChunks,
      totalRows,
    };
  }

  /**
   * Clear registry (for cleanup)
   */
  clear(): void {
    this.registry.clear();
    this.counter = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL REGISTRY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Map of requestId -> ProvenanceRegistry
const registryStore = new Map<string, ProvenanceRegistry>();

/**
 * Get or create a provenance registry for a request
 */
export function getProvenanceRegistry(requestId: string): ProvenanceRegistry {
  let registry = registryStore.get(requestId);
  if (!registry) {
    registry = new ProvenanceRegistry(requestId);
    registryStore.set(requestId, registry);
  }
  return registry;
}

/**
 * Clean up registry for a completed request
 */
export function cleanupProvenanceRegistry(requestId: string): void {
  const registry = registryStore.get(requestId);
  if (registry) {
    registry.clear();
    registryStore.delete(requestId);
  }
}

/**
 * Get all active registries (for debugging)
 */
export function getActiveRegistryCount(): number {
  return registryStore.size;
}
