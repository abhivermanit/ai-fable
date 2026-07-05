# ADR 0002: Model Router Architecture

## Status

Accepted

## Context

The system needs to interact with multiple LLM providers (OpenAI, Anthropic, Google, NVIDIA, Kimi, DeepSeek). Different tasks have different requirements:

- The reviewer needs a capable model for architecture analysis.
- Quick classification tasks can use a fast, cheap model.
- Some environments may only have access to a single provider.

We needed to decide how to structure model access.

## Decision

We will build a **provider-agnostic model router** in `@ai-fable/models`.

The router:

1. Exposes a unified interface for all LLM calls.
2. Selects the provider and model based on environment configuration.
3. Supports fallback chains when a provider is unavailable.
4. Allows callers to express intent (e.g., "capable", "fast") without naming a specific model.

## Rationale

1. **Decoupling:** No package outside `@ai-fable/models` should import a provider SDK directly. This keeps provider-specific code isolated.
2. **Flexibility:** Switching providers requires only an environment variable change, not code changes.
3. **Testability:** Tests can mock the unified interface without knowing about specific providers.
4. **Cost control:** The router can enforce budgets or prefer cheaper models for low-stakes tasks.

## Consequences

- All LLM calls go through the router. There is no "direct" SDK usage elsewhere.
- Adding a new provider means implementing the router's interface for that provider.
- The router adds a thin abstraction layer. This is acceptable given the multi-provider requirement.
