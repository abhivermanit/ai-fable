# ADR-0004: Concurrent Task Execution and Shared-State Locking

**Status:** Open (deferred at Architecture v2 freeze)\
**Date:** 2026-07-05\
**Related:** [architecture.md](../architecture.md) — Task Orchestrator, Execution Runtime, Policy Engine

## Context

The Task Orchestrator's design allows for multiple tasks to be planned and executed. Several layers assume some form of shared state:

- **Execution Runtime** operates on a shared filesystem and git working tree.
- **Policy Engine** tracks "protected files," implying a notion of files currently under active modification.
- **Task Orchestrator** owns the state machine for task progress, which could be per-task or global.

Architecture v2 does not specify whether tasks execute serially (one at a time, system-wide) or concurrently (multiple tasks in-flight), nor how conflicting access to the same files, branches, or git state is arbitrated if concurrency is allowed.

This was flagged during architecture review as a gap that doesn't block freezing the high-level architecture, but does need resolution before Task Orchestrator (Milestone 2) implementation makes irreversible assumptions.

## Decision

**Not yet decided.** This ADR is a placeholder to track the question and its constraints until a decision is made.

## Options to evaluate

1. **Strict serial execution** — one task runs system-wide at a time. Simplest to implement, but likely a throughput bottleneck once agent usage scales.
2. **Per-repository locking** — concurrent tasks allowed across different repos, serialized within a single repo. Reasonable middle ground if most usage spans many repos.
3. **Fine-grained file/branch locking** — concurrent tasks allowed even within a repo, with locks scoped to specific files or branches. Highest complexity, best throughput.
4. **Optimistic concurrency with conflict detection** — allow concurrent execution, detect conflicts at commit/merge time via Verification or Policy Engine, and fail/retry on conflict rather than locking upfront.

## Constraints for implementers (until this ADR is resolved)

- Do not build the Task Orchestrator's task queue with unguarded shared mutable state that would preclude adding locking later (e.g., avoid global in-memory state without a clear seam for a lock/queue abstraction).
- Do not assume serial execution is permanent in any interface contract (e.g., don't hardcode "one task" assumptions into the Client Adapter API).

## Consequences of remaining undecided

- Milestone 2 (Task Orchestrator) can proceed assuming serial execution as an interim default, since this is the simplest and most conservative option and doesn't foreclose the others.
- Milestone 4 (Execution Runtime) should not implement filesystem/git access patterns that assume exclusive access without a defined interim locking strategy — flag this dependency when Milestone 4 begins.

## Follow-up

Revisit this ADR before or during Milestone 4 (Execution Runtime), by which point real usage patterns from Milestones 2–3 should inform whether concurrency is actually needed soon or can remain deferred further.
