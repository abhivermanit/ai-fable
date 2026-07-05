import type { DiffFile } from '@ai-fable/core';
import type { DiffStats } from '../types/index.js';

/**
 * Compute diff statistics from a list of files.
 */
export function computeStats(files: DiffFile[]): DiffStats {
  let insertions = 0;
  let deletions = 0;

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+')) insertions++;
        else if (line.startsWith('-')) deletions++;
      }
    }
  }

  return { files: files.length, insertions, deletions };
}

/**
 * Get the display status of a file.
 */
function fileStatus(file: DiffFile): string {
  if (file.isNew) return 'added';
  if (file.isDeleted) return 'deleted';
  if (file.isRenamed) return 'renamed';
  return 'modified';
}

/**
 * Generate a markdown review report string.
 */
export function generateMarkdown(
  repository: string,
  branch: string,
  files: DiffFile[],
  skipped: string[],
  timestamp: string,
): string {
  const stats = computeStats(files);
  const lines: string[] = [];

  lines.push('# AI Fable Review');
  lines.push('');
  lines.push('## Repository');
  lines.push('');
  lines.push(`\`${repository}\``);
  lines.push('');
  lines.push('## Branch');
  lines.push('');
  lines.push(`\`${branch}\``);
  lines.push('');
  lines.push('## Files Reviewed');
  lines.push('');
  lines.push(`${files.length} file${files.length !== 1 ? 's' : ''}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files changed | ${stats.files} |`);
  lines.push(`| Insertions | ${stats.insertions} |`);
  lines.push(`| Deletions | ${stats.deletions} |`);
  lines.push(`| Skipped | ${skipped.length} |`);
  lines.push('');
  lines.push('## Changed Files');
  lines.push('');

  for (const file of files) {
    const status = fileStatus(file);
    lines.push(`- \`${file.filePath}\` *(${status})*`);
  }
  lines.push('');

  lines.push('## Diff Statistics');
  lines.push('');
  for (const file of files) {
    const fileInsertions = file.hunks.reduce(
      (sum, h) => sum + h.lines.filter((l) => l.startsWith('+')).length,
      0,
    );
    const fileDeletions = file.hunks.reduce(
      (sum, h) => sum + h.lines.filter((l) => l.startsWith('-')).length,
      0,
    );
    lines.push(`| \`${file.filePath}\` | +${fileInsertions} | -${fileDeletions} |`);
  }
  lines.push('');

  if (skipped.length > 0) {
    lines.push('## Skipped Files');
    lines.push('');
    for (const s of skipped) {
      lines.push(`- \`${s}\``);
    }
    lines.push('');
  }

  lines.push('## Warnings');
  lines.push('');
  lines.push('No AI analysis yet. This is a structural report only.');
  lines.push('');
  lines.push('---');
  lines.push(`*Generated at ${timestamp}*`);
  lines.push('');

  return lines.join('\n');
}
