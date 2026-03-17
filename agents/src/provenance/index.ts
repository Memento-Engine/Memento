/**
 * Provenance Module
 * 
 * Exports all provenance-related functionality:
 * - Registry for storing raw data and chunk_ids
 * - Compression utilities for creating summaries
 */

export {
  // Types
  DerivationType,
  ProvenanceRow,
  ChunkConnection,
  ProvenanceEntry,
  ProvenanceSummary,
  CompressedStepOutput,
  
  // Registry class
  ProvenanceRegistry,
  
  // Global registry management
  getProvenanceRegistry,
  cleanupProvenanceRegistry,
  getActiveRegistryCount,
} from "./registry";

export {
  // Compression functions
  compressStepResults,
  createCompressedOutput,
  formatSummariesForContext,
  estimateTokenCount,
  shouldCompress,
} from "./compression";
