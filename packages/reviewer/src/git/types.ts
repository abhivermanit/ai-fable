/**
 * Structured representation of git repository status.
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Files staged for commit */
  staged: string[];
  /** Files modified but not staged */
  modified: string[];
  /** Untracked files */
  untracked: string[];
  /** Whether merge conflicts exist */
  hasConflicts: boolean;
}
