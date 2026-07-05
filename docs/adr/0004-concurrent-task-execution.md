# ADR 0004: Concurrent Task Execution and Shared-State Locking

## Status

Deferred

## Context

The Task Orchestrator may run multiple tasks concurrently. When it does, the Execution Runtime's shared resources (filesystem, git state) and the Policy Engine's "protected files" concept need a locking or coordination mechanism to prevent conflicts.

## Decision

Deferred. This ADR will be resolved when the Task Orchestrator supports parallel task execution.

## Open Questions

1. What locking granularity is appropriate (file-level, directory-level, repository-level)?
2. Should tasks queue behind a lock or fail fast?
3. How does git state isolation work (worktrees, stash, branches)?
4. How does the Policy Engine evaluate protected files under concurrent access?

## Consequences

Until resolved, the Task Orchestrator must execute tasks sequentially.
