import { exec, execOk } from './commands.js';
import { parseStatusOutput } from './parser.js';
import type { GitStatus } from './types.js';

/**
 * Check if the given directory is inside a Git repository.
 */
export function isGitRepository(cwd?: string): boolean {
  return execOk('rev-parse --is-inside-work-tree', cwd);
}

/**
 * Get the absolute path to the repository root.
 */
export function getRepositoryRoot(cwd?: string): string {
  return exec('rev-parse --show-toplevel', cwd);
}

/**
 * Get the current branch name.
 */
export function getCurrentBranch(cwd?: string): string {
  return exec('rev-parse --abbrev-ref HEAD', cwd);
}

/**
 * Get the full repository status.
 */
export function getGitStatus(cwd?: string): GitStatus {
  const branch = getCurrentBranch(cwd);
  const raw = exec('status --porcelain=v1', cwd);
  return parseStatusOutput(raw, branch);
}

/**
 * Get files staged for commit.
 */
export function getStagedFiles(cwd?: string): string[] {
  const output = exec('diff --cached --name-only', cwd);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Get files modified but not staged.
 */
export function getModifiedFiles(cwd?: string): string[] {
  const output = exec('diff --name-only', cwd);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Get untracked files.
 */
export function getUntrackedFiles(cwd?: string): string[] {
  const output = exec('ls-files --others --exclude-standard', cwd);
  return output ? output.split('\n').filter(Boolean) : [];
}

/**
 * Check if there are merge conflicts.
 */
export function hasMergeConflicts(cwd?: string): boolean {
  const output = exec('status --porcelain=v1', cwd);
  const lines = output.split('\n').filter(Boolean);
  return lines.some((line) => {
    const x = line[0];
    const y = line[1];
    return x === 'U' || y === 'U' || (x === 'A' && y === 'A');
  });
}
