# @ai-fable/runtime — API Reference

**Package:** `@ai-fable/runtime`
**Status:** Frozen (Milestone 4)
**Last updated:** 2026-07-05

---

## Public API Surface

### Primary Interface: `Executor`

This is the contract consumed by the Task Orchestrator's Worker implementations. Workers receive an `Executor` without knowing about worktrees, sandbox internals, or process management.

| Method | Signature | Description |
|--------|-----------|-------------|
| `exec` | `(command, options?) → Promise<ShellResult>` | Run a shell command |
| `execOrThrow` | `(command, options?) → Promise<ShellResult>` | Run a command, throw on non-zero exit |
| `readFile` | `(path) → Promise<string>` | Read file contents |
| `writeFile` | `(path, content) → Promise<FileOperationResult>` | Write file (creates parents) |
| `patchFile` | `(path, oldText, newText) → Promise<FileOperationResult>` | String replacement patch |
| `deleteFile` | `(path) → Promise<FileOperationResult>` | Delete a file |
| `fileExists` | `(path) → Promise<boolean>` | Check file existence |
| `listDir` | `(path) → Promise<string[]>` | List directory contents |
| `spawnProcess` | `(command, options?) → ManagedProcess` | Spawn a background process |
| `gitCommit` | `(message) → Promise<ShellResult>` | Stage all + commit |
| `gitStatus` | `() → Promise<string>` | Short-format git status |
| `gitDiff` | `() → Promise<string>` | Uncommitted diff |
| `dispose` | `() → Promise<void>` | Clean up all resources |

**Properties:** `cwd: string`, `disposed: boolean`

---

### Session Management

| Export | Purpose |
|--------|---------|
| `ExecutionSession.create(config)` | Create an isolated execution session for a task |
| `SessionExecutor` | Adapter: implements `Executor` by delegating to `ExecutionSession` |

**`ExecutionSessionConfig`:**

```typescript
{
  taskId: string;
  repoPath: string;
  useWorktree?: boolean;   // default: true
  branch?: string;         // auto-generated if omitted
  sandbox?: Partial<SandboxConfig>;
  signal?: AbortSignal;
}
```

---

### Shell

| Export | Purpose |
|--------|---------|
| `exec(command, options?)` | Execute a shell command (low-level) |
| `execOrThrow(command, options?)` | Execute, throw `ShellError` on failure |
| `ShellError` | Error class with `.result: ShellResult` |
| `ShellAdapter` (interface) | Platform abstraction for shell invocation |
| `PosixShellAdapter` | POSIX implementation (`sh -c`) |
| `setShellAdapter(adapter)` | Swap the active shell adapter |
| `getShellAdapter()` | Get the current shell adapter |

---

### Worktree Manager

| Export | Purpose |
|--------|---------|
| `WorktreeManager` | Create/destroy isolated git worktrees per task |

**Key methods:** `create(taskId, config)`, `destroy(taskId, repoPath)`, `get(taskId)`, `list()`, `destroyAll(repoPath)`

---

### Process Manager

| Export | Purpose |
|--------|---------|
| `ProcessManager` | Track child processes, enforce concurrency limits |

**Key methods:** `spawn(command, options?)`, `kill(id)`, `killAll()`, `get(id)`, `list()`, `prune()`

---

### File Operations

| Export | Purpose |
|--------|---------|
| `FileOps` | Read/write/patch/delete with sandbox enforcement |
| `FileAccessError` | Thrown on boundary or protection violations |

---

### Types (all exported)

`ShellResult`, `ShellOptions`, `WorktreeConfig`, `Worktree`, `SandboxConfig`, `FileOperationResult`, `ManagedProcess`, `ExecutionContext`

---

## Stability Guarantees

| API | Stability | Notes |
|-----|-----------|-------|
| `Executor` interface | **Stable** | This is the public contract. Changes require ADR. |
| `ExecutionSession.create()` | **Stable** | Config shape may gain optional fields. |
| `SessionExecutor` | **Stable** | Adapter pattern; won't change unless `Executor` changes. |
| `exec` / `execOrThrow` | **Stable** | Signature fixed. |
| `ShellAdapter` interface | **Stable** | New implementations expected (Windows). |
| `WorktreeManager` | **Semi-stable** | Internal API; may change if ADR-0005 resolves differently. |
| `ProcessManager` | **Semi-stable** | Likely to gain stdout/stderr streaming in future milestones. |
| `FileOps` | **Semi-stable** | Patch API will evolve (see TODOs). |
| `SandboxConfig` | **Semi-stable** | May gain additional security fields. |

**Stable** = breaking changes require an ADR.
**Semi-stable** = internal to the runtime; may evolve between milestones without ADR, but existing tests must continue passing.

---

## Known Limitations

1. **POSIX only** — Shell execution uses `sh -c`. No Windows support yet.
2. **No streaming output** — `exec()` buffers stdout/stderr. No real-time streaming to callers.
3. **Simple patching** — `patchFile()` uses string replacement. No line-range edits, no multi-edit batches, no conflict detection.
4. **In-memory worktree tracking** — If the process crashes, worktree state is lost. Recovery requires `git worktree prune`.
5. **No resource metering** — CPU, memory, and disk usage are not tracked per process.
6. **No network isolation** — Spawned processes have full network access.
7. **No tsconfig path resolution** — File paths in `FileOps` are literal; no TypeScript path alias support.
8. **Single-repo assumption** — `WorktreeManager` operates on one repo at a time. Multi-repo tasks would need multiple managers.
9. **No stdin support** — `exec()` uses `stdio: ['ignore', ...]`. Interactive commands are not supported.

---

## Planned TODOs

| Item | Target Milestone | Description |
|------|-----------------|-------------|
| `WindowsShellAdapter` | Future | Cross-platform shell support via `cmd.exe` or PowerShell |
| `PatchOperation` / `TextEdit[]` | M5+ | Richer file patching (line-range, multi-edit, LSP-style) |
| `ExecutionProcess` | M5+ | Extend `ManagedProcess` with stdout/stderr streams, resource metrics |
| `ExecutionSnapshot` | M6+ | Serializable session state for replay and debugging |
| Logger integration | M5 | Replace `console.error` TODOs with structured Logger service |
| Streaming output | M5+ | Real-time stdout/stderr forwarding for long-running commands |
| Network isolation | Future | Sandbox network access per-process or per-session |
| Resource limits | Future | CPU/memory/disk caps per spawned process |
| Multi-repo support | Future | Allow tasks spanning multiple repositories |

---

## Usage Pattern

```typescript
import { ExecutionSession, SessionExecutor } from '@ai-fable/runtime';
import type { Executor } from '@ai-fable/runtime';

// The Orchestrator creates a session per task
const session = await ExecutionSession.create({
  taskId: 'task-abc-123',
  repoPath: '/path/to/repo',
  useWorktree: true,  // isolated branch
});

// Workers receive the Executor interface
const executor: Executor = new SessionExecutor(session);

// Worker does its job
await executor.execOrThrow('npm install');
await executor.writeFile('src/feature.ts', 'export function feature() {}');
await executor.execOrThrow('npm run typecheck');
await executor.gitCommit('feat: add feature');

// Orchestrator disposes after task lifecycle completes
await executor.dispose();
```

---

## Error Handling

| Error | When | Recoverable |
|-------|------|-------------|
| `ShellError` | Non-zero exit in `execOrThrow` | Yes — inspect `.result` |
| `FileAccessError` | Path outside sandbox or in protected list | Yes — use allowed paths |
| `Error("disposed")` | Any operation after `dispose()` | No — create new session |
| `Error("Process limit reached")` | `ProcessManager` at max capacity | Yes — kill or wait |
| `Error("Worktree already exists")` | Duplicate `taskId` in `create()` | Yes — use different ID |
