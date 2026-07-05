/**
 * A single hunk within a diff file.
 */
export interface DiffHunk {
  /** Starting line in the old file */
  oldStart: number;
  /** Number of lines in the old file */
  oldLines: number;
  /** Starting line in the new file */
  newStart: number;
  /** Number of lines in the new file */
  newLines: number;
  /** Raw lines of the hunk (prefixed with +, -, or space) */
  lines: string[];
}

/**
 * Represents a single file within a git diff.
 */
export interface DiffFile {
  /** File path (new path if renamed, otherwise the file path) */
  filePath: string;
  /** Previous file path (only set if the file was renamed) */
  oldFilePath?: string;
  /** Whether the file is newly created */
  isNew: boolean;
  /** Whether the file was deleted */
  isDeleted: boolean;
  /** Whether the file was renamed */
  isRenamed: boolean;
  /** Whether the file is binary */
  isBinary: boolean;
  /** Parsed hunks (empty for binary files) */
  hunks: DiffHunk[];
}

/**
 * Summary statistics for a review report.
 */
export interface ReviewSummary {
  /** Total files in the diff */
  totalFiles: number;
  /** Files that were added */
  additions: number;
  /** Files that were modified */
  modifications: number;
  /** Files that were deleted */
  deletions: number;
  /** Files that were skipped (binary) */
  skipped: number;
}

/**
 * The output of a review pass.
 */
export interface ReviewReport {
  /** ISO timestamp of when the review was generated */
  timestamp: string;
  /** Summary statistics */
  summary: ReviewSummary;
  /** Files that were reviewed (non-binary) */
  files: DiffFile[];
  /** Files that were skipped */
  skippedFiles: string[];
  /** Rendered markdown output */
  markdown: string;
}
