# ADR 0006: Confidence Score Storage and Analytics

## Status

Deferred

## Context

The Verification Layer produces confidence scores for each review pass. These scores are useful for:

- Trend analysis (is code quality improving over time?)
- Routing decisions (should this change get extra review?)
- Approval thresholds (auto-approve above X confidence)

The Memory Layer is the natural owner of long-term score storage, but aggregation, dashboarding, and threshold-based automation need design work.

## Decision

Deferred. This ADR will be resolved when the Verification Layer and Memory Layer are both implemented.

## Open Questions

1. What schema represents a confidence score (per-file, per-hunk, per-concern)?
2. How long are scores retained?
3. Who sets approval thresholds — Policy Engine or Verification Layer?
4. Should scores feed back into model routing (lower confidence → more capable model)?

## Consequences

Until resolved, confidence scores are produced and included in reports but not persisted beyond the current review session.
