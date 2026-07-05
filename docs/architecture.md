# Architecture v2

**Status:** Frozen  
**Version:** 2.0

This document defines the system architecture of AI Fable.

---

## Vision

AI Fable is a software engineering control plane. The IDE is only an interface; the intelligence lives inside AI Fable.

---

## Design Principles

- Model independent
- IDE independent
- Verification first
- Human approval for critical actions
- Stateless models
- Everything is a task
- Agents are units of work invoked by the Task Orchestrator; they do not own workflow state

---

## Request Lifecycle (not a strict call sequence)

Model Gateway, Memory Layer, and Policy Engine are cross-cutting services invoked by multiple layers throughout a task's lifecycle — not sequential stages. The ordering below reflects a typical request's flow through the system, not a dependency chain.

```
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
```

---

## Core Layers

### Client Adapters

- VS Code
- Kiro
- CLI
- GitHub

### Task Orchestrator

Owns planning, execution, retries, state machine, and coordination.

Concurrent task execution and shared-state locking are deferred to ADR-0004.

### Agents

Agents are the units of work the Task Orchestrator invokes to perform planning, code generation, or execution steps. Agents are stateless and do not own workflow state, retries, or the state machine — that responsibility stays with the Orchestrator. See Agent Philosophy below.

### Repo Intelligence

Provides repository graph, semantic search, dependency analysis, documentation, embeddings, and retrieval.

### Execution Runtime

Provides shell, browser, git, filesystem, Docker, tests, and MCP tools.

Failure handling and rollback behavior (retry vs. git-state rollback vs. surfacing to Verification) are deferred to ADR-0005.

### Verification Layer

Runs linting, type checking, tests, architecture review, security review, LLM review, and confidence scoring.

Long-term storage and use of confidence scores is owned by the Memory Layer; aggregation and analytics are deferred to ADR-0006.

### Memory Layer

- Session memory
- Repo memory
- User memory
- Long-term memory

### Policy Engine

Controls commit, push, PR creation, protected files, shell execution, and approvals.

### Model Gateway

Routes requests between Claude, GPT, Gemini, Kimi, DeepSeek, Qwen, local models, and future providers.

---

## Agent Philosophy

Agents perform work.

The Task Orchestrator owns the workflow.

---

## Package Responsibilities

| Package | Responsibility |
|---------|---------------|
| `@ai-fable/core` | Shared types, interfaces, errors, constants, and events. All other packages import from here. |
| `@ai-fable/agents` | Agent execution units. Performs planning, code generation, and execution steps on behalf of the Orchestrator. |
| `@ai-fable/browser` | Browser automation primitives. Wraps the underlying browser driver and exposes a stable API. |
| `@ai-fable/memory` | Memory and state management. Provides short-term and long-term context storage. |
| `@ai-fable/models` | Model Gateway. Exposes a unified interface across providers (OpenAI, Anthropic, Google, etc.). |
| `@ai-fable/prompts` | Prompt templates and management. Handles prompt composition, versioning, and selection. |
| `@ai-fable/reviewer` | Code review agent. Analyzes diffs and produces structured review reports. |
| `@ai-fable/tools` | Tool definitions for agents. Each tool follows a consistent interface that agents can discover and invoke. |
| `@ai-fable/utils` | Shared utilities. Logging, retries, configuration loading, and other cross-cutting concerns. |

## Apps

| App | Purpose |
|-----|---------|
| `@ai-fable/api` | Backend API server. Exposes capabilities over HTTP. |
| `@ai-fable/playground` | Interactive playground for testing and debugging. |

## Dependency Rules

1. `core` has **zero** internal dependencies. It depends only on TypeScript built-ins.
2. `utils` may depend on `core`.
3. `models`, `prompts`, `tools`, `browser`, `memory` may depend on `core` and `utils`.
4. `reviewer` may depend on `core`, `utils`, `models`, `prompts`, and `tools`.
5. `agents` may depend on any package except `apps`.
6. Apps (`api`, `playground`) may depend on any package.
7. **No circular dependencies.** If two packages need shared types, move them to `core`.

```
apps/api, apps/playground
        |
    agents
        |
  ┌─────┼─────┬────────┬────────┐
  |     |     |        |        |
reviewer models browser memory prompts tools
  |     |     |        |        |       |
  └─────┴─────┴────────┴────────┴───────┘
        |
      utils
        |
      core
```

---

## Coding Standards

- **Language:** TypeScript everywhere. No JavaScript source files.
- **Module system:** ESM with NodeNext resolution.
- **Strict mode:** All packages use `strict: true`.
- **Exports:** Every package exposes a single `src/index.ts` barrel. Subpath exports are added as needed.
- **Naming:** kebab-case for files and directories, PascalCase for types/interfaces/classes, camelCase for functions/variables.
- **Formatting:** Prettier with project defaults (see `.prettierrc`).
- **Linting:** ESLint flat config at root. Packages inherit unless they need overrides.
- **Error handling:** All custom errors extend a base error from `@ai-fable/core`. No raw `throw new Error()`.
- **Testing:** Vitest. Tests live alongside source as `*.test.ts` files.

---

## Review Pipeline

The review pipeline is powered by `@ai-fable/reviewer`:

1. **Trigger:** Git diff is collected (pre-commit, CI, or CLI invocation).
2. **Parse:** Diff is parsed into structured change objects.
3. **Route:** Changes are dispatched to specialized reviewers (architecture, security, performance, testing).
4. **Analyze:** Each reviewer uses an LLM to assess the changes against project rules.
5. **Report:** Results are aggregated into a structured report with severity levels.
6. **Act:** Report is surfaced to the developer (CLI output, PR comment, or API response).

---

## Model Routing Strategy

The model router (`@ai-fable/models`) provides:

1. **Provider abstraction:** A unified interface regardless of which LLM backend is used.
2. **Configuration-driven:** Provider and model name come from environment variables (`MODEL_PROVIDER`, `MODEL_NAME`).
3. **Fallback chain:** If the primary provider fails, the router can try secondary providers.
4. **Cost awareness:** Different tasks can specify model requirements (fast/cheap vs. capable/expensive).
5. **Supported providers:** OpenAI, Anthropic, Google, NVIDIA, Kimi, DeepSeek (extensible).

The router does not make decisions about which model to use for a given task. That responsibility belongs to the calling package.

---

## Roadmap

1. Reviewer Foundation ✅
2. Task Orchestrator
3. Repo Intelligence
4. Execution Runtime
5. Verification
6. Memory
7. Policy Engine
8. Model Gateway
9. IDE Integrations
10. Production

This is a build sequence, not the runtime call order — Model Gateway is built last but used from step 2 onward once stubbed.

---

## Definition of Success

AI Fable can:

1. Understand a repository.
2. Plan work.
3. Execute changes.
4. Verify correctness.
5. Request approval.
6. Commit safely.
7. Push or create a PR.

Models are interchangeable. The workflow is not.

---

## Reviewer Sign-off

| Reviewer | Status | Notes |
|----------|--------|-------|
| Reviewer 1 | ☐ Pending | |
| Reviewer 2 | ☐ Pending | |
| Reviewer 3 (Claude) | ✅ Approved | 🔴 items resolved. 🟡 items captured as ADR deferrals. |
