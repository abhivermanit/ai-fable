import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { ExecutionSession } from './execution-context.js';

describe('ExecutionSession (integration)', () => {
  const testDir = join(tmpdir(), `runtime-session-${Date.now()}`);

  beforeAll(() => {
    // Create a test git repo
    mkdirSync(testDir, { recursive: true });
    execSync('git init', { cwd: testDir });
    execSync('git config user.email "test@test.com"', { cwd: testDir });
    execSync('git config user.name "Test"', { cwd: testDir });
    execSync('echo "hello" > file.txt', { cwd: testDir });
    execSync('git add . && git commit -m "init"', { cwd: testDir });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates a session without worktree', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-no-wt',
      repoPath: testDir,
      useWorktree: false,
    });

    expect(session.context.cwd).toBe(testDir);
    expect(session.context.worktree).toBeUndefined();
    expect(session.context.disposed).toBe(false);

    await session.dispose();
    expect(session.context.disposed).toBe(true);
  });

  it('executes shell commands in context', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-exec',
      repoPath: testDir,
      useWorktree: false,
    });

    const result = await session.exec('echo "from session"');
    expect(result.stdout.trim()).toBe('from session');
    expect(result.exitCode).toBe(0);

    await session.dispose();
  });

  it('provides file operations', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-files',
      repoPath: testDir,
      useWorktree: false,
    });

    const content = await session.files.read('file.txt');
    expect(content.trim()).toBe('hello');

    const result = await session.files.write('new-file.ts', 'export const x = 1;');
    expect(result.success).toBe(true);

    await session.dispose();
  });

  it('gets git status', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-git-status',
      repoPath: testDir,
      useWorktree: false,
    });

    const status = await session.gitStatus();
    // There should be the new-file.ts from previous test
    expect(typeof status).toBe('string');

    await session.dispose();
  });

  it('creates a session with worktree isolation', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-wt-creation',
      repoPath: testDir,
      useWorktree: true,
      branch: 'task/test-wt-creation',
    });

    expect(session.context.worktree).toBeDefined();
    expect(session.context.worktree!.branch).toBe('task/test-wt-creation');
    expect(session.context.cwd).toBe(session.context.worktree!.path);
    expect(session.context.cwd).not.toBe(testDir);

    // Can execute in worktree
    const result = await session.exec('git branch --show-current');
    expect(result.stdout.trim()).toBe('task/test-wt-creation');

    // Can read files from parent repo
    const content = await session.files.read('file.txt');
    expect(content.trim()).toBe('hello');

    // Changes are isolated
    await session.files.write('isolated-file.ts', 'isolated');
    const status = await session.gitStatus();
    expect(status).toContain('isolated-file.ts');

    await session.dispose();
    expect(session.context.disposed).toBe(true);
  });

  it('throws after dispose', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-disposed',
      repoPath: testDir,
      useWorktree: false,
    });

    await session.dispose();

    await expect(session.exec('echo nope')).rejects.toThrow('disposed');
  });

  it('git commit works in worktree', async () => {
    const session = await ExecutionSession.create({
      taskId: 'test-commit',
      repoPath: testDir,
      useWorktree: true,
      branch: 'task/test-commit',
    });

    await session.files.write('committed.ts', 'export const committed = true;');
    const commitResult = await session.gitCommit('test commit');
    expect(commitResult.exitCode).toBe(0);

    // Verify commit exists
    const log = await session.exec('git log --oneline -1');
    expect(log.stdout).toContain('test commit');

    await session.dispose();
  });
});
