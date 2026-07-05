import type { DiffFile } from '@ai-fable/core';
import type { ReviewOutput } from '../types/index.js';
import { computeStats } from './markdown.js';

/**
 * Get the display status of a file.
 */
function fileStatus(file: DiffFile): 'added' | 'modified' | 'deleted' | 'renamed' {
  if (file.isNew) return 'added';
  if (file.isDeleted) return 'deleted';
  if (file.isRenamed) return 'renamed';
  return 'modified';
}

/**
 * Generate a structured JSON review output.
 */
export function generateJson(
  repository: string,
  branch: string,
  files: DiffFile[],
  skipped: string[],
  timestamp: string,
): ReviewOutput {
  const stats = computeStats(files);

  const fileDetails = files.map((file) => {
    const insertions = file.hunks.reduce(
      (sum, h) => sum + h.lines.filter((l) => l.startsWith('+')).length,
      0,
    );
    const deletions = file.hunks.reduce(
      (sum, h) => sum + h.lines.filter((l) => l.startsWith('-')).length,
      0,
    );

    return {
      path: file.filePath,
      status: fileStatus(file),
      insertions,
      deletions,
    };
  });

  return {
    timestamp,
    repository,
    branch,
    files: fileDetails,
    stats,
    skipped,
  };
}
