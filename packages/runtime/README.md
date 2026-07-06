# @ai-fable/runtime

Execution Runtime — shell execution, filesystem operations, git worktrees, and process management for AI Fable.

## Overview

This package provides the Execution Runtime layer described in the frozen architecture. It gives the Task Orchestrator's workers the ability to execute shell commands, modify files, and manage git state in isolated environments.

## Architecture

```
Task Orchestrator
       ↓
    Executor (interface)
       ↓
  SessionExecutor (adapter)
       ↓
  ExecutionSession
       ↓
┌──────┼──────────┐
│      │          │
Shell  FileOps   WorktreeManager
       │
  ProcessManager
```

## Components

### Shell Executor
Run shell commands with timeout, abort signal, and output capture.

### Worktree Manager
Create and destroy isolated git worktrees per task (per ADR-0005: "default to isolated branches or worktrees per task").

### Process Manager
Track spawned child processes, enforce concurrency limits, and clean up on abort.

### File Operations
Read, write, patch, and delete files with sandbox enforcement (protected paths, boundary checks).

### Execution Session
Combines all the above into a single session for one task. Handles setup (worktree creation) and teardown (process kill, worktree removal).

### Executor Interface
The public contract consumed by the Orchestrator's Worker implementations. Workers interact with `Executor` without knowing about worktrees or sandbox internals.

## Usage

```typescript
import { ExecutionSession, SessionExecutor } from '@ai-fable/runtime';
import type { Executor } from '@ai-fable/runtime';

// Create an isolated execution session for a task
const session = await ExecutionSession.create({
  taskId: 'task-123',
  repoPath: '/path/to/repo',
  useWorktree: true,
});

// Get the Executor interface for workers
const executor: Executor = new SessionExecutor(session);

// Use it
await executor.exec('npm install');
await executor.writeFile('src/new.ts', 'export const x = 1;');
await executor.gitCommit('feat: add new file');
const status = await executor.gitStatus();

// Clean up
await executor.dispose();
```

## Security

- **Sandbox boundaries**: File operations are restricted to the session's working directory
- **Protected paths**: `.git` is protected by default; additional paths can be configured
- **Allowed write paths**: Optionally restrict writes to specific subdirectories
- **Process limits**: Enforce max concurrent processes per session

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm dev        # Watch mode
pnpm lint       # Run ESLint
pnpm typecheck  # Type check without emitting
pnpm test       # Run tests
pnpm clean      # Remove build artifacts
```
