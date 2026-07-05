// Git layer
export {
  isGitRepository,
  getRepositoryRoot,
  getCurrentBranch,
  getGitStatus,
  getStagedFiles,
  getModifiedFiles,
  getUntrackedFiles,
  hasMergeConflicts,
  getDiff,
  getStagedDiff,
  getWorkingTreeDiff,
  parseDiff,
} from './git/index.js';

// Filtering & chunking
export { filterFiles, shouldSkip } from './utils/filter.js';
export { chunkDiff } from './utils/chunker.js';

// Reports
export { generateMarkdown, computeStats } from './report/markdown.js';
export { generateJson } from './report/json.js';

// Types
export type { DiffMode, DiffChunk, DiffStats, ReviewOutput, CliOptions } from './types/index.js';
export type { GitStatus } from './git/types.js';
