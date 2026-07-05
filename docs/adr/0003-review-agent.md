# ADR 0003: Dedicated Review Agent

## Status

Accepted

## Context

Code review is a critical part of the development workflow. We want automated review that:

- Catches architectural violations early.
- Identifies security issues in diffs.
- Checks for performance regressions.
- Verifies test coverage for new code.

We needed to decide whether review logic should live inside the general agent system or as a standalone package.

## Decision

We will build a **dedicated review agent** as `@ai-fable/reviewer`, separate from the general-purpose agent orchestration in `@ai-fable/agents`.

The reviewer:

1. Has its own CLI (`packages/reviewer/src/cli/`).
2. Integrates with Git directly (`packages/reviewer/src/git/`).
3. Uses specialized sub-reviewers for different concerns (`packages/reviewer/src/reviewers/`).
4. Produces structured reports (`packages/reviewer/src/report/`).

## Rationale

1. **Independence:** The reviewer should work without the full agent stack. It needs Git + LLM, not browser automation or memory.
2. **Milestone ordering:** Building the reviewer first gives us a tool that improves all subsequent development.
3. **Specialization:** Review passes (architecture, security, performance, testing) have distinct prompts and evaluation criteria. A dedicated package keeps this organized.
4. **CI integration:** The reviewer can run as a standalone CLI in GitHub Actions without deploying the API or agent.

## Consequences

- The reviewer is a first-class package, not a plugin or extension of the agent.
- It may share prompt utilities with `@ai-fable/prompts` but owns its review-specific prompts.
- Other packages should not import from `@ai-fable/reviewer`. It is a leaf node in the dependency graph (except for apps).

## Follow-up

No further action required. The reviewer is complete as Milestone 1. Future enhancements (additional review passes, CI integration improvements) do not require architectural changes.
