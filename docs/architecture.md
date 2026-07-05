# AI Fable Architecture

**Status:** ❄️ Frozen — Architecture v2\
**Version:** 2.0\
**Frozen on:** 2026-07-05\
**Supersedes:** Architecture v1

This document is the canonical architecture reference. Implementation follows this document. Changes after freeze require an ADR, not an inline edit.

## Vision

AI Fable is a software engineering control plane. The IDE is only an
interface; the intelligence lives inside AI Fable.

## Design Principles

-   Model independent
-   IDE independent
-   Verification first
-   Human approval for critical actions
-   Stateless models
-   Everything is a task
-   Agents are units of work invoked by the Task Orchestrator; they do not own workflow state

## Request Lifecycle

*Note: this reflects a typical request's flow through the system, not a strict dependency chain. Model Gateway, Memory Layer, and Policy Engine are cross-cutting services invoked by multiple layers throughout a task's lifecycle — not sequential stages called only at the end.*

Client Adapters

↓

Task Orchestrator

↓

Repo Intelligence

↓

Execution Runtime

↓

Verification Layer

↓

Memory Layer

↓

Policy & Approval Engine

↓

Model Gateway

↓

External Models

## Core Layers

### Client Adapters

-   VS Code
-   Kiro
-   CLI
-   GitHub

### Task Orchestrator

Owns planning, execution, retries, state machine, and coordination.

> Concurrent task execution and shared-state locking are deferred to [ADR-0004](./adr/0004-concurrent-task-execution.md).

### Agents

Agents are the units of work the Task Orchestrator invokes to perform planning, code generation, or execution steps. Agents are stateless and do not own workflow state, retries, or the state machine — that responsibility stays with the Orchestrator. (See Agent Philosophy.)

### Repo Intelligence

Provides repository graph, semantic search, dependency analysis,
documentation, embeddings, and retrieval.

### Execution Runtime

Provides shell, browser, git, filesystem, Docker, tests, and MCP tools.

> Failure handling and rollback behavior (retry vs. git-state rollback vs. surfacing to Verification) are deferred to [ADR-0005](./adr/0005-execution-failure-rollback.md).

### Verification Layer

Runs linting, type checking, tests, architecture review, security
review, LLM review, and confidence scoring.

> Long-term storage and use of confidence scores is owned by the Memory Layer; aggregation and analytics are deferred to [ADR-0006](./adr/0006-confidence-score-analytics.md).

### Memory Layer

-   Session memory
-   Repo memory
-   User memory
-   Long-term memory

### Policy Engine

Controls commit, push, PR creation, protected files, shell execution,
and approvals.

### Model Gateway

Routes requests between Claude, GPT, Gemini, Kimi, DeepSeek, Qwen, local
models, and future providers.

## Agent Philosophy

Agents perform work.

The Task Orchestrator owns the workflow.

## Definition of Success

AI Fable can:

1.  Understand a repository.
2.  Plan work.
3.  Execute changes.
4.  Verify correctness.
5.  Request approval.
6.  Commit safely.
7.  Push or create a PR.

Models are interchangeable.

The workflow is not.

## Related Documents

- [Roadmap](./roadmap.md)
- [ADR-0004: Concurrent Task Execution](./adr/0004-concurrent-task-execution.md)
- [ADR-0005: Execution Failure Rollback](./adr/0005-execution-failure-rollback.md)
- [ADR-0006: Confidence Score Analytics](./adr/0006-confidence-score-analytics.md)
