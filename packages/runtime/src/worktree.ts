import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { exec, execOrThrow } from './shell.js';
import type { Worktree, WorktreeConfig } from './types.js';

/**
 * Manages git worktrees for isolated task execution.
 *
 * Per ADR-0005: "Execution Runtime work should default to isolated branches
 * or worktrees per task where feasible, since this keeps all rollback options
 * open regardless of which is eventually chosen."
 *
 * ## Lifecycle Contract
 *
 * 1. **Creation**: `create(taskId, config)` creates a worktree + branch atomically.
 *    If creation fails (e.g., git error), no orphan worktree is left behind.
 *
 * 2. **Ownership**: Each worktree is owned by exactly one task (keyed by taskId).
 *    A task cannot have two worktrees. Attempting to create a second throws.
 *
 * 3. **Destruction**: `destroy(taskId, repoPath)` removes the worktree from git,
 *    deletes the directory, and removes the branch. All steps are best-effort —
 *    partial failure is logged but does not throw.
 *
 * 4. **Caller responsibility**: The caller (ExecutionSession) MUST call `destroy()`
 *    when the task completes, fails, or is cancelled. The session's `dispose()`
 *    method handles this automatically.
 *
 * 5. **Crash recovery**: If the process crashes without cleanup, orphan worktrees
 *    can be recovered via `git worktree prune` on the main repo. This is an
 *    acceptable tradeoff for the simplicity of in-memory tracking.
 *
 * 6. **Shutdown**: `destroyAll(repoPath)` cleans up all active worktrees (e.g.,
 *    on graceful shutdown). Should be called in process exit handlers.
 */
export class WorktreeManager {
  /** Active worktrees, keyed by task ID */
  private worktrees = new Map<string, Worktree>();

  /**
   * Create a new worktree for a task.
   *
   * Creates a new branch and checks it out in an isolated directory.
   * If creation fails, no orphan worktree is left (atomic guarantee).
   */
  async create(taskId: string, config: WorktreeConfig): Promise<Worktree> {
    if (this.worktrees.has(taskId)) {
      throw new Error(`Worktree already exists for task: ${taskId}`);
    }

    const baseDir = config.baseDir ?? join(tmpdir(), 'ai-fable-worktrees');
    const worktreePath = join(baseDir, `task-${taskId.slice(0, 8)}-${randomUUID().slice(0, 8)}`);
    const branch = config.branch;
    const baseBranch = config.baseBranch ?? 'HEAD';

    try {
      if (config.createBranch !== false) {
        await execOrThrow(
          `git worktree add -b "${branch}" "${worktreePath}" ${baseBranch}`,
          { cwd: config.repoPath, timeoutMs: 30_000 },
        );
      } else {
        await execOrThrow(
          `git worktree add "${worktreePath}" "${branch}"`,
          { cwd: config.repoPath, timeoutMs: 30_000 },
        );
      }
    } catch (error) {
      // Atomic guarantee: clean up any partial state on failure
      await this.forceCleanup(worktreePath, branch, config.repoPath);
      throw error;
    }

    const worktree: Worktree = {
      path: worktreePath,
      branch,
      taskId,
      createdAt: new Date().toISOString(),
    };

    this.worktrees.set(taskId, worktree);
    return worktree;
  }

  /**
   * Remove a worktree and clean up its branch.
   *
   * All steps are best-effort — partial failures are tolerated
   * so that remaining cleanup still runs.
   */
  async destroy(taskId: string, repoPath: string): Promise<boolean> {
    const worktree = this.worktrees.get(taskId);
    if (!worktree) return false;

    await this.forceCleanup(worktree.path, worktree.branch, repoPath);
    this.worktrees.delete(taskId);
    return true;
  }

  /**
   * Get the worktree for a task.
   */
  get(taskId: string): Worktree | undefined {
    return this.worktrees.get(taskId);
  }

  /**
   * List all active worktrees.
   */
  list(): Worktree[] {
    return [...this.worktrees.values()];
  }

  /**
   * Clean up all worktrees (e.g., on graceful shutdown).
   * Should be called in process exit handlers.
   */
  async destroyAll(repoPath: string): Promise<void> {
    for (const taskId of [...this.worktrees.keys()]) {
      await this.destroy(taskId, repoPath);
    }
  }

  /**
   * Number of active worktrees.
   */
  get size(): number {
    return this.worktrees.size;
  }

  /**
   * Force-clean a worktree path and branch.
   * Best-effort — individual steps may fail without propagating.
   */
  private async forceCleanup(worktreePath: string, branch: string, repoPath: string): Promise<void> {
    // Remove the worktree from git tracking
    await exec(
      `git worktree remove "${worktreePath}" --force`,
      { cwd: repoPath, timeoutMs: 15_000 },
    );

    // Remove the directory if it still exists
    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // TODO: Use Logger service to report directory cleanup failure
    }

    // Delete the branch (may fail if it was never created — that's fine)
    await exec(
      `git branch -D "${branch}"`,
      { cwd: repoPath, timeoutMs: 10_000 },
    );
  }
}
