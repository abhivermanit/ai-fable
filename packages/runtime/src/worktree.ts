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
 */
export class WorktreeManager {
  /** Active worktrees, keyed by task ID */
  private worktrees = new Map<string, Worktree>();

  /**
   * Create a new worktree for a task.
   *
   * Creates a new branch and checks it out in an isolated directory.
   */
  async create(taskId: string, config: WorktreeConfig): Promise<Worktree> {
    if (this.worktrees.has(taskId)) {
      throw new Error(`Worktree already exists for task: ${taskId}`);
    }

    const baseDir = config.baseDir ?? join(tmpdir(), 'ai-fable-worktrees');
    const worktreePath = join(baseDir, `task-${taskId.slice(0, 8)}-${randomUUID().slice(0, 8)}`);
    const branch = config.branch;
    const baseBranch = config.baseBranch ?? 'HEAD';

    // Create the branch if needed, then add the worktree
    if (config.createBranch !== false) {
      // Create branch and worktree in one command
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
   */
  async destroy(taskId: string, repoPath: string): Promise<boolean> {
    const worktree = this.worktrees.get(taskId);
    if (!worktree) return false;

    // Remove the worktree from git
    await exec(
      `git worktree remove "${worktree.path}" --force`,
      { cwd: repoPath, timeoutMs: 15_000 },
    );

    // Clean up the directory if it still exists
    try {
      await rm(worktree.path, { recursive: true, force: true });
    } catch {
      // TODO: Use Logger service to report cleanup failure
    }

    // Optionally delete the branch
    await exec(
      `git branch -D "${worktree.branch}"`,
      { cwd: repoPath, timeoutMs: 10_000 },
    );

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
   * Clean up all worktrees (e.g., on shutdown).
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
}
