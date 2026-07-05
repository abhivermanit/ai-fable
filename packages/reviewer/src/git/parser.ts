import type { GitStatus } from './types.js';

/**
 * Extract the file path from a porcelain v1 status line.
 *
 * Format: XY PATH — but the separator space may overlap with Y when Y is ' '.
 * - "M  path" → X='M', Y=' ', separator=' ', path at 3
 * - " M path" → X=' ', Y='M', separator=' ', path at 3
 * - "?? path" → X='?', Y='?', separator=' ', path at 3
 * - "M path"  → X='M', Y=' ' (no extra separator), path at 2
 *
 * Safe approach: always take XY from positions 0-1 and find path after the
 * first space at or after position 2.
 */
function extractFilePath(line: string): string {
  // The standard format is XY<space>filename.
  // Position 2 should always be a space separator.
  // But some git versions/modes merge Y-space with the separator.
  // Find the actual path start.
  const afterXY = line.substring(2);
  if (afterXY.startsWith(' ')) {
    return afterXY.substring(1);
  }
  return afterXY;
}

/**
 * Parse the output of `git status --porcelain=v1` into a GitStatus object.
 */
export function parseStatusOutput(raw: string, branch: string): GitStatus {
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];
  let hasConflicts = false;

  if (!raw) {
    return { branch, staged, modified, untracked, hasConflicts };
  }

  const lines = raw.split('\n').filter(Boolean);

  for (const line of lines) {
    const indexStatus = line.charAt(0);
    const workTreeStatus = line.charAt(1);
    const filePath = extractFilePath(line);

    // Merge conflicts
    if (indexStatus === 'U' || workTreeStatus === 'U' || (indexStatus === 'A' && workTreeStatus === 'A')) {
      hasConflicts = true;
      continue;
    }

    // Untracked
    if (indexStatus === '?' && workTreeStatus === '?') {
      untracked.push(filePath);
      continue;
    }

    // Staged (index has a meaningful change)
    if (indexStatus !== ' ' && indexStatus !== '?') {
      staged.push(filePath);
    }

    // Modified in working tree (not staged)
    if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
      modified.push(filePath);
    }
  }

  return { branch, staged, modified, untracked, hasConflicts };
}
