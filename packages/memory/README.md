# @ai-fable/memory

Memory Layer — structured state records for tasks, execution history, verification reports, and artifacts.

## Overview

The Memory Layer provides durable, queryable state for AI Fable. It is not an LLM conversation history — it stores structured records that answer:

- What tasks exist?
- What has already been attempted?
- What changed?
- What evidence exists?
- What is the current state?

## Architecture

```
MemoryService (unified facade)
      │
      ├── TaskRecord store
      ├── ExecutionRecord store
      ├── VerificationRecord store
      └── Artifact store
      │
      ▼
  MemoryStore (persistence abstraction)
      │
      ▼
  InMemoryStore (default) / FileStore / DatabaseStore (future)
```

## Record Types

| Type | What it stores |
|------|---------------|
| `TaskRecord` | Final state of a completed/failed/cancelled task |
| `ExecutionRecord` | Single execution attempt (steps, duration, success) |
| `VerificationRecord` | Verification result (verifier outcomes, policy decision) |
| `Artifact` | Diffs, logs, outputs, reports — any task-produced data |

## Key Design Decisions

- **Structured over free-form** — Records have typed schemas, not text blobs
- **Persistence-agnostic** — `MemoryStore` interface allows swapping backends
- **Query-first** — Filter by status, source, labels, date range
- **Immutable records** — Once written, records are not mutated (append-only semantics)
- **Task-centric** — All records are keyed by task ID for easy correlation

## Usage

```typescript
import { MemoryService, InMemoryStore } from '@ai-fable/memory';

const memory = new MemoryService(new InMemoryStore());

// Record a task
await memory.recordTask({ id: 'task-1', description: 'fix bug', status: 'completed', ... });

// Record execution
await memory.recordExecution({ taskId: 'task-1', attempt: 0, steps: [...], ... });

// Store an artifact
await memory.storeArtifact({ taskId: 'task-1', type: 'diff', label: 'patch.diff', content: '...' });

// Query
const recent = await memory.recentTasks(10);
const summary = await memory.getTaskSummary('task-1');
const stats = await memory.stats();
```

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm clean      # Remove build artifacts
```
