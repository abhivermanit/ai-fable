# @ai-fable/models

Model Gateway — provider-agnostic LLM interface with routing, reliability, and observability for AI Fable.

## Overview

The Model Gateway is the single entry point for all LLM interactions. The Orchestrator calls `gateway.chat(...)` — everything else (provider selection, routing, retries, fallback, telemetry) is internal.

The Orchestrator never knows whether a request went to OpenAI, Claude, Gemini, or a local model.

## Architecture

```
              ModelGateway
                   │
     ┌─────────────┼─────────────┐
     │             │             │
ProviderRegistry  Router      Telemetry
     │             │             │
     ├────Retry────┤             │
     ├────Cache────┤             │
     ├──Streaming──┤             │
     ├──Fallback───┤             │
     └────Usage────┘             │
                   │
    ┌──────────────┼────────────────┐
    │              │                │
OpenAIAdapter  ClaudeAdapter  OllamaAdapter
                                    │
                             LiteLLMAdapter
```

LiteLLM is just another adapter — not the foundation.

## Components

### ModelProvider Interface

```typescript
interface ModelProvider {
  readonly name: string;
  models(): ModelInfo[];
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<StreamChunk>;
  embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  health(): Promise<ProviderHealth>;
}
```

### Provider Registry

Register, unregister, and lookup providers by name, model, or capability.

### Router

Selects the best provider based on:
- Required capabilities
- Preferred provider/model
- Cost constraints
- Context window requirements
- Provider health status

### Reliability Layer

- Retries with exponential backoff
- Request timeout
- Circuit breaker (per provider, auto-resets)
- Fallback to alternative providers

### Telemetry

Every request records: provider, model, latency, prompt tokens, completion tokens, estimated cost, retries, cache status, finish reason, errors.

### Prompt Layer

```typescript
const template = createTemplate({
  name: 'code-review',
  system: 'You are a {{role}} reviewing {{language}} code.',
  user: 'Review this diff:\n{{diff}}',
});

const response = await gateway.chatWithTemplate(template, {
  role: 'senior engineer',
  language: 'TypeScript',
  diff: '...',
});
```

### Structured Output

```typescript
const result = await gateway.chatStructured<PlanOutput>(request, schema);
if (result.success) {
  // result.data is typed and validated
}
```

The rest of AI-Fable never parses raw model text.

## Usage

```typescript
import { ModelGateway } from '@ai-fable/models';

const gateway = new ModelGateway();

// Register providers
gateway.registry.register(myClaudeAdapter);
gateway.registry.register(myOpenAIAdapter);

// Simple chat
const response = await gateway.chat({
  messages: [{ role: 'user', content: 'Explain this code' }],
});

// With routing preferences
const response = await gateway.chat(request, {
  capabilities: ['tool_use', 'long_context'],
  preferredProvider: 'claude',
});

// Structured output
const plan = await gateway.chatStructured<TaskPlan>(request, planSchema);

// Streaming
for await (const chunk of gateway.stream(request)) {
  process.stdout.write(chunk.content ?? '');
}

// Telemetry
const stats = gateway.stats();
// → { totalRequests, successCount, totalTokens, averageLatencyMs, ... }
```

## Known Limitations

- No real provider adapters yet (stubs only for testing)
- Basic JSON schema validation (not full JSON Schema / ajv)
- No response caching implementation
- No streaming reliability (retries only for non-streaming)
- No token counting before sending (context window overflow not prevented)
- Circuit breaker is in-memory (resets on process restart)

## Planned

- OpenAI adapter
- Claude adapter
- Ollama adapter (local models)
- Response caching layer
- Token counting / context window management
- Cost budgeting and alerts
- Full JSON Schema validation (ajv or zod)
- Streaming with retry support

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm clean      # Remove build artifacts
```
