# AI Fable Roadmap

**Architecture reference:** [architecture.md](./architecture.md) (Frozen v2, 2026-07-05)

Build order below is a construction sequence, not the runtime call order. Model Gateway is built last but stubbed/used from Milestone 2 onward — see the Request Lifecycle section in the architecture doc for the actual runtime flow.

1.  Reviewer Foundation ✅
2.  Task Orchestrator ⬅️ *current milestone*
3.  Repo Intelligence
4.  Execution Runtime
5.  Verification
6.  Memory
7.  Policy Engine
8.  Model Gateway
9.  IDE Integrations
10. Production

## Milestone 2 Notes (Task Orchestrator)

Per the frozen architecture:

- Orchestrator owns planning, execution, retries, and the state machine.
- Agents (invoked by the Orchestrator) are stateless and do not own workflow state — see Agents section in architecture.md.
- Concurrency/locking behavior is deferred per ADR-0004; do not block Milestone 2 on solving this, but do not build assumptions that preclude future locking (e.g., avoid unguarded shared mutable state in the Orchestrator's task queue).

## Open ADRs (non-blocking for freeze)

| ADR | Title | Status |
|---|---|---|
| [ADR-0004](./adr/0004-concurrent-task-execution.md) | Concurrent task execution and shared-state locking | Open |
| [ADR-0005](./adr/0005-execution-failure-rollback.md) | Execution failure handling and rollback | Open |
| [ADR-0006](./adr/0006-confidence-score-analytics.md) | Confidence score storage and analytics | Open |
