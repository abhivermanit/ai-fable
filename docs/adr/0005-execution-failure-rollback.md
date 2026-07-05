# ADR-0005: Execution Failure Handling and Rollback

**Status:** Open (deferred at Architecture v2 freeze)\
**Date:** 2026-07-05\
**Related:** [architecture.md](../architecture.md) — Execution Runtime, Verification Layer, Task Orchestrator, Memory Layer

## Context

The Verification Layer is responsible for catching problems (lint, type, test, security, architecture, LLM review, confidence scoring), but Architecture v2 does not specify what happens after a failure is caught:

- Does the **Task Orchestrator** retry the failed step, and if so, how many times / with what backoff or re-planning?
- Does the **Execution Runtime** roll back git/filesystem state to the last known-good point?
- Does the failure get surfaced only to the human approver, or does it also get recorded for future reference (e.g., in Memory Layer, to avoid repeating a failed approach)?
- Are there failure classes that should NOT be retried automatically (e.g., failures during a step that already performed a `git push`)?

This is a real gap: Execution Runtime has direct access to git, filesystem, Docker, and shell — meaning a failed task could leave the repository in a partially-modified, uncommitted, or inconsistent state if rollback isn't defined.

## Decision

**Not yet decided.** This ADR tracks the question and interim guardrails.

## Options to evaluate

1. **Git-native rollback** — Execution Runtime always works in a dedicated branch/worktree per task, and failure triggers a hard reset/branch discard. Clean and simple, relies on git as the safety net.
2. **Orchestrator-driven retry with re-planning** — on Verification failure, the Task Orchestrator re-invokes the relevant Agent with the failure context, up to N attempts, before escalating to human approval.
3. **Checkpoint-based rollback** — Execution Runtime snapshots state at defined checkpoints (e.g., before each Agent invocation), and failures roll back to the nearest checkpoint rather than the task start.
4. **No automatic rollback — always escalate** — any Verification failure halts the task and requests human input rather than attempting automatic recovery. Safest, slowest.

## Constraints for implementers (until this ADR is resolved)

- Execution Runtime work should default to isolated branches or worktrees per task where feasible, since this keeps all rollback options open regardless of which is eventually chosen.
- Do not implement automatic retry logic in the Task Orchestrator that assumes unlimited retries or silent failure suppression — cap retries conservatively (e.g., 1) as an interim default until this ADR resolves.
- Any step that performs an irreversible action (`git push`, PR creation) must go through the Policy & Approval Engine regardless of retry/rollback strategy — this is already required by existing design principles and is not affected by this ADR.

## Consequences of remaining undecided

- Milestone 4 (Execution Runtime) and Milestone 5 (Verification) can proceed on isolated-branch-per-task as a safe interim default.
- Milestone 2 (Task Orchestrator) should build retry logic behind a single, swappable interface so the eventual strategy (options 1–4 above) can be substituted without a rewrite.

## Follow-up

Revisit this ADR during Milestone 5 (Verification), once failure modes from real Milestone 4 usage are observable.
