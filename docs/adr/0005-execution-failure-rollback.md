# ADR 0005: Execution Failure Handling and Rollback

## Status

Deferred

## Context

The Execution Runtime performs shell commands, git operations, filesystem writes, and browser actions. When a step fails, the system needs a defined strategy for recovery: retry, git-state rollback, partial undo, or surfacing to the Verification Layer for human decision.

## Decision

Deferred. This ADR will be resolved when the Execution Runtime is implemented.

## Open Questions

1. Which operations are idempotent and safe to retry?
2. What is the rollback boundary (last commit, last known-good state, task start)?
3. Should the system create automatic savepoints (git stash, branch checkpoint)?
4. When does failure escalate to the Verification Layer vs. retry silently?

## Consequences

Until resolved, execution failures will surface immediately to the user without automatic recovery.
