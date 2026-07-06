/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error output */
  stderr: string;
  /** Whether the command was killed due to timeout */
  timedOut: boolean;
  /** Whether the command was aborted via signal */
  aborted: boolean;
  /** Execution duration in milliseconds */
  durationMs: number;
}

/**
 * Options for shell command execution.
 */
export interface ShellOptions {
  /** Working directory (defaults to sandbox cwd) */
  cwd?: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Maximum output buffer size in bytes (default: 5MB) */
  maxBuffer?: number;
}

/**
 * Configuration for creating a worktree.
 */
export interface WorktreeConfig {
  /** Path to the main repository */
  repoPath: string;
  /** Branch name to create/checkout in the worktree */
  branch: string;
  /** Base directory for worktree storage (defaults to system temp) */
  baseDir?: string;
  /** Whether to create the branch if it doesn't exist */
  createBranch?: boolean;
  /** Base ref to branch from (defaults to HEAD) */
  baseBranch?: string;
}

/**
 * Represents an active git worktree.
 */
export interface Worktree {
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch name */
  branch: string;
  /** Task ID that owns this worktree */
  taskId: string;
  /** When the worktree was created */
  createdAt: string;
}

/**
 * Configuration for the execution sandbox.
 */
export interface SandboxConfig {
  /** Working directory for execution */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Shell timeout in ms */
  timeoutMs: number;
  /** Max output buffer size in bytes */
  maxBuffer: number;
  /** Paths that are allowed to be written (empty = all allowed) */
  allowedWritePaths: string[];
  /** Paths that are never writable (takes precedence over allowed) */
  protectedPaths: string[];
}

/**
 * Result of a file operation.
 */
export interface FileOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Path that was operated on */
  path: string;
  /** Error message if failed */
  error?: string;
}

/**
 * A running process tracked by the process manager.
 */
export interface ManagedProcess {
  /** Unique process ID (not OS PID) */
  id: string;
  /** OS process ID */
  pid: number;
  /** Command that was executed */
  command: string;
  /** When the process started */
  startedAt: string;
  /** Current status */
  status: 'running' | 'completed' | 'failed' | 'killed';
  /** Exit code (set after completion) */
  exitCode?: number;
}

/**
 * The execution context for a single task.
 * Combines worktree, shell, and file operations into one session.
 */
export interface ExecutionContext {
  /** Unique context/session ID */
  id: string;
  /** Task ID this context belongs to */
  taskId: string;
  /** Working directory for this context */
  cwd: string;
  /** The worktree (if using worktree isolation) */
  worktree?: Worktree;
  /** Whether this context has been disposed */
  disposed: boolean;
}
