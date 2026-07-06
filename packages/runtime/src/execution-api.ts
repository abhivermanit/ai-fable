import type { ShellResult, ShellOptions, FileOperationResult, ManagedProcess } from './types.js';

/**
 * The Execution API interface consumed by the Task Orchestrator's Workers.
 *
 * This is the contract between the Orchestrator and the Execution Runtime.
 * Workers receive an Executor to perform actual work without knowing
 * about worktrees, sandbox config, or process management internals.
 */
export interface Executor {
  /** The working directory for this execution */
  readonly cwd: string;

  /** Whether this executor has been disposed */
  readonly disposed: boolean;

  /**
   * Run a shell command.
   */
  exec(command: string, options?: ShellOptions): Promise<ShellResult>;

  /**
   * Run a shell command, throwing on non-zero exit.
   */
  execOrThrow(command: string, options?: ShellOptions): Promise<ShellResult>;

  /**
   * Read a file's contents.
   */
  readFile(path: string): Promise<string>;

  /**
   * Write content to a file.
   */
  writeFile(path: string, content: string): Promise<FileOperationResult>;

  /**
   * Apply a text replacement patch to a file.
   */
  patchFile(path: string, oldText: string, newText: string): Promise<FileOperationResult>;

  /**
   * Delete a file.
   */
  deleteFile(path: string): Promise<FileOperationResult>;

  /**
   * Check if a file exists.
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * List directory contents.
   */
  listDir(path: string): Promise<string[]>;

  /**
   * Spawn a background process.
   */
  spawnProcess(command: string, options?: ShellOptions): ManagedProcess;

  /**
   * Commit all changes with a message.
   */
  gitCommit(message: string): Promise<ShellResult>;

  /**
   * Get the current git status (short format).
   */
  gitStatus(): Promise<string>;

  /**
   * Get the current git diff.
   */
  gitDiff(): Promise<string>;

  /**
   * Dispose of this executor and clean up resources.
   */
  dispose(): Promise<void>;
}
