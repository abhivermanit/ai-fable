// Types
export type {
  ShellResult,
  ShellOptions,
  WorktreeConfig,
  Worktree,
  SandboxConfig,
  FileOperationResult,
  ManagedProcess,
  ExecutionContext,
} from './types.js';

// Shell
export { exec, execOrThrow, ShellError, PosixShellAdapter, setShellAdapter, getShellAdapter } from './shell.js';
export type { ShellAdapter } from './shell.js';

// Worktree Manager
export { WorktreeManager } from './worktree.js';

// Process Manager
export { ProcessManager } from './process-manager.js';

// File Operations
export { FileOps, FileAccessError } from './file-ops.js';

// Execution Session
export { ExecutionSession } from './execution-context.js';
export type { ExecutionSessionConfig } from './execution-context.js';

// Execution API (interface for Orchestrator workers)
export type { Executor } from './execution-api.js';

// Session Executor (Executor implementation)
export { SessionExecutor } from './session-executor.js';
