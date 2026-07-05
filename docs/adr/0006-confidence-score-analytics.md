# ADR-0006: Confidence Score Storage and Analytics

**Status:** Open (deferred at Architecture v2 freeze)\
**Date:** 2026-07-05\
**Related:** [architecture.md](../architecture.md) — Verification Layer, Memory Layer

## Context

The Verification Layer produces a confidence score as part of its review (alongside linting, type checking, tests, architecture review, security review, and LLM review). Architecture v2 assigns long-term ownership of this data to the Memory Layer, but does not yet specify:

- **Storage granularity** — per-task, per-file, per-agent, per-model, or some combination?
- **Retention** — how long confidence scores are kept, and whether they're summarized/aggregated over time or kept as raw records indefinitely.
- **Consumers** — is confidence score data purely observational (for humans reviewing system behavior), or does it feed back into the system — e.g., influencing Model Gateway routing decisions, adjusting Policy Engine approval thresholds, or flagging agents/models with degrading performance?
- **Analytics surface** — is there a dashboard, report, or API for querying historical confidence trends, or is this purely internal state with no user-facing surface in v2?

## Decision

**Not yet decided.** This ADR tracks the question and interim guardrails.

## Options to evaluate

1. **Passive logging only** — Memory Layer stores confidence scores as an audit trail with no feedback loop. Simplest; defers all "smart" use of the data to a future version.
2. **Threshold feedback into Policy Engine** — low confidence scores automatically tighten approval requirements (e.g., require human approval even for otherwise low-risk actions). Adds real safety value but couples Memory Layer and Policy Engine more tightly.
3. **Routing feedback into Model Gateway** — confidence trends per model/provider inform future routing decisions (e.g., deprioritize a model with degrading confidence on a given task type). Highest long-term value, most complexity, and not needed until Model Gateway (Milestone 8) exists.
4. **Full analytics surface** — dedicated dashboard/API for confidence trends, exposed to users. Out of scope for near-term milestones; likely a post-Production feature.

## Constraints for implementers (until this ADR is resolved)

- Verification Layer should emit confidence scores in a structured, versioned format (not free text) so that whichever storage/analytics approach is chosen later doesn't require re-instrumenting Verification.
- Memory Layer's schema for confidence data should not assume a single consumer — keep the storage layer decoupled from any specific feedback mechanism (Policy Engine, Model Gateway, or a future dashboard) until one is chosen.

## Consequences of remaining undecided

- Milestone 5 (Verification) can proceed emitting confidence scores in a structured format without needing to know the eventual consumer.
- Milestone 6 (Memory) should implement passive storage (Option 1) as the interim default — this is the only option that doesn't require Policy Engine or Model Gateway to exist yet, both of which are later milestones.
- Options 2–4 should be revisited once Policy Engine (Milestone 7) and Model Gateway (Milestone 8) are further along, since they're the natural consumers of this feedback loop.

## Follow-up

Revisit this ADR at the start of Milestone 7 (Policy Engine), when threshold-feedback (Option 2) becomes concretely actionable.
