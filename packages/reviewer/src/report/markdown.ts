import type { DiffFile, ReviewReport, ReviewSummary } from '@ai-fable/core';

/**
 * Build a review summary from parsed diff files.
 */
function buildSummary(files: DiffFile[], skipped: string[]): ReviewSummary {
  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  for (const file of files) {
    if (file.isNew) {
      additions++;
    } else if (file.isDeleted) {
      deletions++;
    } else {
      modifications++;
    }
  }

  return {
    totalFiles: files.length + skipped.length,
    additions,
    modifications,
    deletions,
    skipped: skipped.length,
  };
}

/**
 * Render a DiffFile as a markdown section.
 */
function renderFile(file: DiffFile): string {
  const lines: string[] = [];

  let status = 'modified';
  if (file.isNew) status = 'added';
  if (file.isDeleted) status = 'deleted';
  if (file.isRenamed) status = 'renamed';

  lines.push(`### ${file.filePath}`);
  lines.push('');
  lines.push(`**Status:** ${status}`);

  if (file.isRenamed && file.oldFilePath) {
    lines.push(`**Renamed from:** ${file.oldFilePath}`);
  }

  lines.push('');

  if (file.hunks.length > 0) {
    lines.push('```diff');
    for (const hunk of file.hunks) {
      lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      for (const line of hunk.lines) {
        lines.push(line);
      }
    }
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate a full markdown review report.
 */
export function generateMarkdownReport(
  files: DiffFile[],
  skippedFiles: string[],
): ReviewReport {
  const summary = buildSummary(files, skippedFiles);
  const timestamp = new Date().toISOString();

  const markdownLines: string[] = [];

  markdownLines.push('# Review Report');
  markdownLines.push('');
  markdownLines.push(`**Generated:** ${timestamp}`);
  markdownLines.push('');
  markdownLines.push('## Summary');
  markdownLines.push('');
  markdownLines.push(`| Metric | Count |`);
  markdownLines.push(`|--------|-------|`);
  markdownLines.push(`| Total files | ${summary.totalFiles} |`);
  markdownLines.push(`| Added | ${summary.additions} |`);
  markdownLines.push(`| Modified | ${summary.modifications} |`);
  markdownLines.push(`| Deleted | ${summary.deletions} |`);
  markdownLines.push(`| Skipped (binary) | ${summary.skipped} |`);
  markdownLines.push('');

  if (skippedFiles.length > 0) {
    markdownLines.push('## Skipped Files');
    markdownLines.push('');
    for (const skipped of skippedFiles) {
      markdownLines.push(`- ${skipped}`);
    }
    markdownLines.push('');
  }

  if (files.length > 0) {
    markdownLines.push('## Files');
    markdownLines.push('');
    for (const file of files) {
      markdownLines.push(renderFile(file));
    }
  }

  const markdown = markdownLines.join('\n');

  return {
    timestamp,
    summary,
    files,
    skippedFiles,
    markdown,
  };
}
