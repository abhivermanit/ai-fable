import type { DiffFile } from '@ai-fable/core';

/**
 * Mode for reading diffs.
 */
export type DiffMode = 'staged' | 'all';

/**
 * A chunk of diff content preserving file boundaries.
 */
export interface DiffChunk {
  /** Index of this chunk (0-based) */
  index: number;
  /** Total number of chunks */
  total: number;
  /** Files contained in this chunk */
  files: DiffFile[];
  /** Approximate character count of this chunk */
  size: number;
}

/**
 * Statistics for a diff.
 */
export interface DiffStats {
  /** Number of files changed */
  files: number;
  /** Number of lines added */
  insertions: number;
  /** Number of lines deleted */
  deletions: number;
}

/**
 * Complete review output for JSON serialization.
 */
export interface ReviewOutput {
  /** ISO timestamp */
  timestamp: string;
  /** Repository root path */
  repository: string;
  /** Current branch */
  branch: string;
  /** List of reviewed files */
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    insertions: number;
    deletions: number;
  }>;
  /** Aggregate stats */
  stats: DiffStats;
  /** Files that were skipped */
  skipped: string[];
}

/**
 * CLI options parsed from argv.
 */
export interface CliOptions {
  /** Diff mode */
  mode: DiffMode;
  /** Output directory */
  output: string;
  /** Generate JSON report */
  json: boolean;
  /** Generate markdown report */
  markdown: boolean;
  /** Show help */
  help: boolean;
}
