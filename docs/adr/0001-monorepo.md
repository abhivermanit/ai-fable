# ADR 0001: Monorepo with pnpm Workspaces

## Status

Accepted

## Context

We are building a software engineering control plane that consists of multiple interconnected components: model integrations, browser automation, prompt management, memory, tooling, and a review agent. These components share types, utilities, and configuration.

We needed to decide between:

- A single repository with a flat structure
- A polyrepo (one repo per component)
- A monorepo with workspaces

## Decision

We chose a **pnpm monorepo** with Turborepo for task orchestration.

Structure:

```
apps/       — Deployable applications
packages/   — Reusable library packages
docs/       — Documentation
```

## Rationale

1. **Shared types:** All packages import from `@ai-fable/core`. A monorepo makes cross-package type safety trivial.
2. **Atomic changes:** A single PR can update a model interface and all consumers simultaneously.
3. **Simpler CI:** One pipeline builds, tests, and lints everything.
4. **pnpm efficiency:** Deduplicates dependencies and enforces strict peer dependency resolution.
5. **Turborepo:** Provides caching and parallelism without complex build scripts.

## Consequences

- All contributors work in the same repo. This can slow `git` operations as the repo grows.
- Package versioning is simplified (all packages share version `0.0.0` while private).
- Adding a new package requires creating the standard file set (package.json, tsconfig.json, src/index.ts).

## Follow-up

No further action required. This decision is foundational and unlikely to change unless the project scales beyond monorepo feasibility.
