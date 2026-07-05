import { exec } from './commands.js';
import type { DiffFile, DiffHunk } from '@ai-fable/core';

/**
 * Read the staged diff from git.
 * Falls back to unstaged diff if nothing is staged.
 */
export function readGitDiff(cwd?: string): string {
  // Try staged diff first
  const staged = exec('diff --cached', cwd);
  if (staged.length > 0) {
    return staged;
  }

  // Fall back to unstaged diff
  return exec('diff', cwd);
}

/**
 * Parse a unified diff string into structured DiffFile objects.
 */
export function parseDiff(raw: string): DiffFile[] {
  if (!raw) return [];

  const files: DiffFile[] = [];
  const fileChunks = raw.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const lines = chunk.split('\n');
    const headerLine = lines[0] ?? '';

    // Extract file paths from "a/path b/path"
    const pathMatch = headerLine.match(/^a\/(.+?) b\/(.+)$/);
    const oldFilePath = pathMatch?.[1] ?? '';
    const newFilePath = pathMatch?.[2] ?? '';

    const isBinary = lines.some((l) => l.startsWith('Binary files'));
    const isNew = lines.some((l) => l.startsWith('new file mode'));
    const isDeleted = lines.some((l) => l.startsWith('deleted file mode'));
    const isRenamed = lines.some((l) => l.startsWith('rename from'));

    const hunks: DiffHunk[] = [];

    if (!isBinary) {
      let currentHunk: DiffHunk | null = null;

      for (const line of lines) {
        const hunkHeader = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);

        if (hunkHeader) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          currentHunk = {
            oldStart: parseInt(hunkHeader[1]!, 10),
            oldLines: parseInt(hunkHeader[2] || '1', 10),
            newStart: parseInt(hunkHeader[3]!, 10),
            newLines: parseInt(hunkHeader[4] || '1', 10),
            lines: [],
          };
        } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
          currentHunk.lines.push(line);
        }
      }

      if (currentHunk) {
        hunks.push(currentHunk);
      }
    }

    files.push({
      filePath: newFilePath,
      oldFilePath: isRenamed ? oldFilePath : undefined,
      isNew,
      isDeleted,
      isRenamed,
      isBinary,
      hunks,
    });
  }

  return files;
}
