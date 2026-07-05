# AI Fable Architecture v2

**Status:** Superseded by [architecture.md](./architecture.md)\
**Version:** 2.0

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

## High-Level Architecture

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

### Repo Intelligence

Provides repository graph, semantic search, dependency analysis,
documentation, embeddings, and retrieval.

### Execution Runtime

Provides shell, browser, git, filesystem, Docker, tests, and MCP tools.

### Verification Layer

Runs linting, type checking, tests, architecture review, security
review, LLM review, and confidence scoring.

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

## Roadmap

1.  Reviewer Foundation ✅
2.  Task Orchestrator
3.  Repo Intelligence
4.  Execution Runtime
5.  Verification
6.  Memory
7.  Policy Engine
8.  Model Gateway
9.  IDE Integrations
10. Production

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
