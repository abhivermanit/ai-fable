# Architecture

This document defines the high-level architecture of the AI Fable monorepo.

## Package Responsibilities

| Package | Responsibility |
|---------|---------------|
| `@ai-fable/core` | Shared types, interfaces, errors, constants, and events. All other packages import from here. |
| `@ai-fable/agents` | Agent orchestration logic. Coordinates models, tools, browser, and memory into autonomous workflows. |
| `@ai-fable/browser` | Browser automation primitives. Wraps the underlying browser driver and exposes a stable API. |
| `@ai-fable/memory` | Memory and state management. Provides short-term and long-term context storage for agents. |
| `@ai-fable/models` | LLM model integrations. Exposes a unified interface across providers (OpenAI, Anthropic, Google, etc.). |
| `@ai-fable/prompts` | Prompt templates and management. Handles prompt composition, versioning, and selection. |
| `@ai-fable/reviewer` | Code review agent. Analyzes diffs and produces structured review reports. |
| `@ai-fable/tools` | Tool definitions for agents. Each tool follows a consistent interface that agents can discover and invoke. |
| `@ai-fable/utils` | Shared utilities. Logging, retries, configuration loading, and other cross-cutting concerns. |

## Apps

| App | Purpose |
|-----|---------|
| `@ai-fable/api` | Backend API server. Exposes agent capabilities over HTTP. |
| `@ai-fable/playground` | Interactive playground for testing and debugging agents. |

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

## Coding Standards

- **Language:** TypeScript everywhere. No JavaScript source files.
- **Module system:** ESM with NodeNext resolution.
- **Strict mode:** All packages use `strict: true`.
- **Exports:** Every package exposes a single `src/index.ts` barrel. Subpath exports are added as needed.
- **Naming:** kebab-case for files and directories, PascalCase for types/interfaces/classes, camelCase for functions/variables.
- **Formatting:** Prettier with project defaults (see `.prettierrc`).
- **Linting:** ESLint flat config at root. Packages inherit unless they need overrides.
- **Error handling:** All custom errors extend a base error from `@ai-fable/core`. No raw `throw new Error()`.
- **Testing:** Vitest (when added). Tests live alongside source in `__tests__/` or `*.test.ts` files.

## Review Pipeline

The review pipeline is powered by `@ai-fable/reviewer`:

1. **Trigger:** Git diff is collected (pre-commit, CI, or CLI invocation).
2. **Parse:** Diff is parsed into structured change objects.
3. **Route:** Changes are dispatched to specialized reviewers (architecture, security, performance, testing).
4. **Analyze:** Each reviewer uses an LLM to assess the changes against project rules.
5. **Report:** Results are aggregated into a structured report with severity levels.
6. **Act:** Report is surfaced to the developer (CLI output, PR comment, or API response).

## Model Routing Strategy

The model router (`@ai-fable/models`) provides:

1. **Provider abstraction:** A unified interface regardless of which LLM backend is used.
2. **Configuration-driven:** Provider and model name come from environment variables (`MODEL_PROVIDER`, `MODEL_NAME`).
3. **Fallback chain:** If the primary provider fails, the router can try secondary providers.
4. **Cost awareness:** Different tasks can specify model requirements (fast/cheap vs. capable/expensive).
5. **Supported providers:** OpenAI, Anthropic, Google, NVIDIA, Kimi, DeepSeek (extensible).

The router does not make decisions about which model to use for a given task. That responsibility belongs to the calling package (e.g., the reviewer decides it needs a capable model for architecture review, and requests it from the router).
