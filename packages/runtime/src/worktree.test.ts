import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { WorktreeManager } from './worktree.js';
import { exec } from './shell.js';

describe('WorktreeManager (reliability)', () => {
  const testDir = join(tmpdir(), `worktree-reliability-${Date.now()}`);
  let manager: WorktreeManager;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });
    execSync('echo "base content" > base.txt', { cwd: testDir });
    execSync('git add . && git commit -m "initial commit"', { cwd: testDir });
  });

  afterEach(async () => {
    // Clean up all worktrees after each test
    if (manager) {
      await manager.destroyAll(testDir);
    }
    // Prune any orphans
    execSync('git worktree prune', { cwd: testDir });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('crash during worktree creation', () => {
    it('cleans up on git failure (invalid base branch)', async () => {
      manager = new WorktreeManager();

      await expect(
        manager.create('crash-test-1', {
          repoPath: testDir,
          branch: 'task/crash-1',
          createBranch: true,
          baseBranch: 'nonexistent-branch-xyz',
        }),
      ).rejects.toThrow();

      // No orphan worktree left
      expect(manager.size).toBe(0);
      expect(manager.get('crash-test-1')).toBeUndefined();

      // Git worktree list should only show main
      const result = await exec('git worktree list', { cwd: testDir });
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(1); // only the main worktree
    });

    it('cleans up on duplicate branch name', async () => {
      manager = new WorktreeManager();

      // Create a branch that already exists
      execSync('git branch existing-branch', { cwd: testDir });

      await expect(
        manager.create('crash-test-2', {
          repoPath: testDir,
          branch: 'existing-branch',
          createBranch: true, // will fail because branch exists
        }),
      ).rejects.toThrow();

      expect(manager.size).toBe(0);

      // The forceCleanup in create() may have already deleted the branch.
      // Clean up only if it still exists.
      const branchCheck = execSync('git branch --list existing-branch', { cwd: testDir }).toString().trim();
      if (branchCheck) {
        execSync('git branch -D existing-branch', { cwd: testDir });
      }
    });
  });

  describe('crash during command execution in worktree', () => {
    it('worktree remains usable after command failure', async () => {
      manager = new WorktreeManager();
      const worktree = await manager.create('exec-crash', {
        repoPath: testDir,
        branch: 'task/exec-crash',
      });

      // Run a failing command
      const failResult = await exec('exit 1', { cwd: worktree.path });
      expect(failResult.exitCode).toBe(1);

      // Worktree still works
      const okResult = await exec('echo "still alive"', { cwd: worktree.path });
      expect(okResult.stdout.trim()).toBe('still alive');
      expect(okResult.exitCode).toBe(0);

      // Git operations still work
      const statusResult = await exec('git status', { cwd: worktree.path });
      expect(statusResult.exitCode).toBe(0);
    });

    it('worktree remains usable after command timeout', async () => {
      manager = new WorktreeManager();
      const worktree = await manager.create('timeout-crash', {
        repoPath: testDir,
        branch: 'task/timeout-crash',
      });

      // Run a command that times out
      const timeoutResult = await exec('sleep 60', {
        cwd: worktree.path,
        timeoutMs: 50,
      });
      expect(timeoutResult.timedOut).toBe(true);

      // Worktree still operational
      const okResult = await exec('cat base.txt', { cwd: worktree.path });
      expect(okResult.stdout.trim()).toBe('base content');
    });
  });

  describe('two worktrees created concurrently', () => {
    it('creates two worktrees for different tasks simultaneously', async () => {
      manager = new WorktreeManager();

      const [wt1, wt2] = await Promise.all([
        manager.create('concurrent-1', {
          repoPath: testDir,
          branch: 'task/concurrent-1',
        }),
        manager.create('concurrent-2', {
          repoPath: testDir,
          branch: 'task/concurrent-2',
        }),
      ]);

      expect(wt1.path).not.toBe(wt2.path);
      expect(wt1.branch).not.toBe(wt2.branch);
      expect(manager.size).toBe(2);

      // Both worktrees are functional
      const r1 = await exec('git branch --show-current', { cwd: wt1.path });
      const r2 = await exec('git branch --show-current', { cwd: wt2.path });
      expect(r1.stdout.trim()).toBe('task/concurrent-1');
      expect(r2.stdout.trim()).toBe('task/concurrent-2');

      // Changes in one don't affect the other
      execSync('echo "wt1 only" > wt1-file.txt', { cwd: wt1.path });
      expect(existsSync(join(wt2.path, 'wt1-file.txt'))).toBe(false);
    });

    it('rejects duplicate taskId', async () => {
      manager = new WorktreeManager();

      await manager.create('dupe-task', {
        repoPath: testDir,
        branch: 'task/dupe-task',
      });

      await expect(
        manager.create('dupe-task', {
          repoPath: testDir,
          branch: 'task/dupe-task-2',
        }),
      ).rejects.toThrow('Worktree already exists');

      expect(manager.size).toBe(1);
    });
  });

  describe('git worktree prune after forced interruption', () => {
    it('prune recovers from orphaned worktree directory removal', async () => {
      manager = new WorktreeManager();
      const worktree = await manager.create('orphan-test', {
        repoPath: testDir,
        branch: 'task/orphan-test',
      });

      // Simulate crash: forcibly remove the worktree directory without git cleanup
      rmSync(worktree.path, { recursive: true, force: true });

      // Git still thinks the worktree exists
      const beforePrune = await exec('git worktree list', { cwd: testDir });
      expect(beforePrune.stdout).toContain('orphan-test');

      // Prune fixes it
      const pruneResult = await exec('git worktree prune', { cwd: testDir });
      expect(pruneResult.exitCode).toBe(0);

      // Now git no longer tracks the orphan
      const afterPrune = await exec('git worktree list', { cwd: testDir });
      expect(afterPrune.stdout).not.toContain('orphan-test');

      // Clean up the branch manually since the manager's destroy won't find the worktree
      await exec(`git branch -D "task/orphan-test"`, { cwd: testDir });
      manager = new WorktreeManager(); // reset to avoid afterEach issues
    });
  });

  describe('multiple agents using different worktrees simultaneously', () => {
    it('three agents can write and commit independently', async () => {
      manager = new WorktreeManager();

      // Create three worktrees simulating three concurrent agents
      const sessions = await Promise.all([
        manager.create('agent-a', { repoPath: testDir, branch: 'task/agent-a' }),
        manager.create('agent-b', { repoPath: testDir, branch: 'task/agent-b' }),
        manager.create('agent-c', { repoPath: testDir, branch: 'task/agent-c' }),
      ]);

      // Each agent writes a different file
      execSync('echo "agent A work" > agent-a.txt', { cwd: sessions[0].path });
      execSync('echo "agent B work" > agent-b.txt', { cwd: sessions[1].path });
      execSync('echo "agent C work" > agent-c.txt', { cwd: sessions[2].path });

      // Each agent commits independently (in parallel)
      await Promise.all(
        sessions.map(async (wt, i) => {
          await exec('git add -A', { cwd: wt.path });
          await exec(`git commit -m "agent ${['A', 'B', 'C'][i]} commit"`, { cwd: wt.path });
        }),
      );

      // Verify each branch has only its own file
      const logA = await exec('git log --oneline -1', { cwd: sessions[0].path });
      expect(logA.stdout).toContain('agent A commit');

      const logB = await exec('git log --oneline -1', { cwd: sessions[1].path });
      expect(logB.stdout).toContain('agent B commit');

      const logC = await exec('git log --oneline -1', { cwd: sessions[2].path });
      expect(logC.stdout).toContain('agent C commit');

      // Verify isolation: agent A doesn't have agent B's file
      expect(existsSync(join(sessions[0].path, 'agent-b.txt'))).toBe(false);
      expect(existsSync(join(sessions[1].path, 'agent-a.txt'))).toBe(false);
      expect(existsSync(join(sessions[2].path, 'agent-a.txt'))).toBe(false);
    });

    it('destroying one worktree does not affect others', async () => {
      manager = new WorktreeManager();

      await manager.create('multi-1', { repoPath: testDir, branch: 'task/multi-1' });
      const wt2 = await manager.create('multi-2', { repoPath: testDir, branch: 'task/multi-2' });
      await manager.create('multi-3', { repoPath: testDir, branch: 'task/multi-3' });

      // Destroy the middle one
      await manager.destroy('multi-2', testDir);

      expect(manager.size).toBe(2);
      expect(manager.get('multi-2')).toBeUndefined();
      expect(existsSync(wt2.path)).toBe(false);

      // Others still work
      const wt1 = manager.get('multi-1')!;
      const wt3 = manager.get('multi-3')!;

      const r1 = await exec('git status', { cwd: wt1.path });
      const r3 = await exec('git status', { cwd: wt3.path });
      expect(r1.exitCode).toBe(0);
      expect(r3.exitCode).toBe(0);
    });
  });
});
