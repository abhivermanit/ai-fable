export {
  isGitRepository,
  getRepositoryRoot,
  getCurrentBranch,
  getGitStatus,
  getStagedFiles,
  getModifiedFiles,
  getUntrackedFiles,
  hasMergeConflicts,
} from './repository.js';
export { getDiff, getStagedDiff, getWorkingTreeDiff, parseDiff } from './diff-reader.js';

export type { GitStatus } from './types.js';
