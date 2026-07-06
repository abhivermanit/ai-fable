import { randomUUID } from 'node:crypto';
import { exec, execOrThrow, ShellError } from './shell.js';
import { FileOps, FileAccessError } from './file-ops.js';
import { ProcessManager } from './process-manager.js';
import { WorktreeManager } from './worktree.js';
import type {
  ExecutionContext,
  ShellResult,
  ShellOptions,
  FileOperationResult,
  SandboxConfig,
  WorktreeConfig,
  Worktree,
  ManagedProcess,
} from './types.js';

/**
 * Configuration for creating an execution session.
 */
export interface ExecutionSessionConfig {
  /** Task ID this session belongs to */
  taskId: string;
  /** Repository root path */
  repoPath: string;
  /** Whether to use worktree isolation (default: true) */
  useWorktree?: boolean;
  /** Worktree branch name (auto-generated if not provided) */
  branch?: string;
  /** Sandbox configuration overrides */
  sandbox?: Partial<SandboxConfig>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Default sandbox configuration.
 */
function defaultSandbox(cwd: string): SandboxConfig {
  return {
    cwd,
    env: {},
    timeoutMs: 30_000,
    maxBuffer: 5 * 1024 * 1024,
    allowedWritePaths: [],
    protectedPaths: ['.git'],
  };
}

/**
 * An execution session for a single task.
 *
 * Provides a unified interface to shell execution, file operations,
 * and process management within an isolated context (worktree).
 *
 * The Orchestrator's Worker implementations use this to perform
 * actual work (running commands, editing files, etc.).
 */
export class ExecutionSession {
  public readonly context: ExecutionContext;
  public readonly files: FileOps;
  public readonly processes: ProcessManager;

  private readonly worktreeManager: WorktreeManager;
  private readonly sandboxConfig: SandboxConfig;
  private readonly signal?: AbortSignal;
  private readonly repoPath: string;

  private constructor(
    context: ExecutionContext,
    sandboxConfig: SandboxConfig,
    worktreeManager: WorktreeManager,
    repoPath: string,
    signal?: AbortSignal,
  ) {
    this.context = context;
    this.sandboxConfig = sandboxConfig;
    this.files = new FileOps(sandboxConfig);
    this.processes = new ProcessManager();
    this.worktreeManager = worktreeManager;
    this.repoPath = repoPath;
    this.signal = signal;
  }

  /**
   * Create a new execution session.
   *
   * If `useWorktree` is true (default), creates an isolated git worktree.
   * Otherwise, executes in the repository root directly.
   */
  static async create(config: ExecutionSessionConfig): Promise<ExecutionSession> {
    const worktreeManager = new WorktreeManager();
    let cwd = config.repoPath;
    let worktree: Worktree | undefined;

    if (config.useWorktree !== false) {
      const branch = config.branch ?? `task/${config.taskId.slice(0, 8)}`;
      const worktreeConfig: WorktreeConfig = {
        repoPath: config.repoPath,
        branch,
        createBranch: true,
      };

      worktree = await worktreeManager.create(config.taskId, worktreeConfig);
      cwd = worktree.path;
    }

    const sandboxConfig: SandboxConfig = {
      ...defaultSandbox(cwd),
      ...config.sandbox,
      cwd,
    };

    const context: ExecutionContext = {
      id: randomUUID(),
      taskId: config.taskId,
      cwd,
      worktree,
      disposed: false,
    };

    return new ExecutionSession(
      context,
      sandboxConfig,
      worktreeManager,
      config.repoPath,
      config.signal,
    );
  }

  /**
   * Execute a shell command in this session's context.
   */
  async exec(command: string, options: ShellOptions = {}): Promise<ShellResult> {
    this.assertNotDisposed();
    return exec(command, {
      cwd: this.context.cwd,
      timeoutMs: this.sandboxConfig.timeoutMs,
      maxBuffer: this.sandboxConfig.maxBuffer,
      signal: this.signal,
      ...options,
      env: { ...this.sandboxConfig.env, ...options.env },
    });
  }

  /**
   * Execute a shell command and throw on failure.
   */
  async execOrThrow(command: string, options: ShellOptions = {}): Promise<ShellResult> {
    this.assertNotDisposed();
    return execOrThrow(command, {
      cwd: this.context.cwd,
      timeoutMs: this.sandboxConfig.timeoutMs,
      maxBuffer: this.sandboxConfig.maxBuffer,
      signal: this.signal,
      ...options,
      env: { ...this.sandboxConfig.env, ...options.env },
    });
  }

  /**
   * Spawn a background process in this session's context.
   */
  spawnProcess(command: string, options: ShellOptions = {}): ManagedProcess {
    this.assertNotDisposed();
    return this.processes.spawn(command, {
      cwd: this.context.cwd,
      signal: this.signal,
      ...options,
    });
  }

  /**
   * Git commit all changes in the worktree.
   */
  async gitCommit(message: string): Promise<ShellResult> {
    this.assertNotDisposed();
    await this.exec('git add -A');
    return this.execOrThrow(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  }

  /**
   * Get git status of the worktree.
   */
  async gitStatus(): Promise<string> {
    this.assertNotDisposed();
    const result = await this.exec('git status --short');
    return result.stdout;
  }

  /**
   * Get git diff of uncommitted changes.
   */
  async gitDiff(): Promise<string> {
    this.assertNotDisposed();
    const result = await this.exec('git diff');
    return result.stdout;
  }

  /**
   * Dispose of this session, cleaning up all resources.
   *
   * - Kills all running processes
   * - Removes the worktree (if created)
   */
  async dispose(): Promise<void> {
    if (this.context.disposed) return;
    this.context.disposed = true;

    // Kill all running processes
    this.processes.killAll();

    // Destroy the worktree
    if (this.context.worktree) {
      await this.worktreeManager.destroy(this.context.taskId, this.repoPath);
    }
  }

  /**
   * Assert the session hasn't been disposed.
   */
  private assertNotDisposed(): void {
    if (this.context.disposed) {
      throw new Error(`Execution session ${this.context.id} has been disposed`);
    }
  }
}

export { ShellError, FileAccessError };
