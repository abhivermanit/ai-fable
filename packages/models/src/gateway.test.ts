import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelGateway } from './gateway.js';
import { ProviderRegistry } from './registry.js';
import { Router, NoProviderError } from './router.js';
import { HealthTracker } from './health.js';
import { TelemetryCollector } from './telemetry.js';
import { renderTemplate, createTemplate, PromptRenderError } from './prompts.js';
import { parseStructuredOutput, extractJson } from './structured-output.js';
import type { ModelProvider, ChatRequest, ChatResponse, ModelInfo, ProviderHealth, StreamChunk, EmbeddingResponse } from './types.js';

// --- Test helpers ---

function makeProvider(name: string, models: ModelInfo[] = [defaultModel(name)]): ModelProvider {
  return {
    name,
    models: () => models,
    chat: vi.fn(async (req: ChatRequest): Promise<ChatResponse> => ({
      message: { role: 'assistant', content: 'hello from ' + name },
      model: models[0].id,
      provider: name,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 50,
      requestId: 'req-123',
      cached: false,
      finishReason: 'stop',
    })),
    stream: async function* () {
      yield { content: 'chunk1', done: false };
      yield { content: 'chunk2', done: true, finishReason: 'stop' as const };
    },
    embeddings: vi.fn(async () => ({
      embeddings: [[0.1, 0.2, 0.3]],
      model: models[0].id,
      provider: name,
      usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      latencyMs: 20,
    })),
    health: vi.fn(async (): Promise<ProviderHealth> => ({
      provider: name,
      healthy: true,
      latencyMs: 10,
      checkedAt: new Date().toISOString(),
    })),
  };
}

function defaultModel(provider: string): ModelInfo {
  return {
    id: `${provider}-model`,
    name: `${provider} Model`,
    provider,
    capabilities: ['chat', 'streaming', 'tool_use', 'structured_output'],
    contextWindow: 128_000,
    maxOutputTokens: 4096,
    costPer1kPromptTokens: 0.003,
    costPer1kCompletionTokens: 0.015,
  };
}

function failingProvider(name: string): ModelProvider {
  return {
    name,
    models: () => [defaultModel(name)],
    chat: vi.fn(async () => { throw new Error(`${name} failed`); }),
    stream: async function* () { throw new Error(`${name} stream failed`); },
    embeddings: vi.fn(async () => { throw new Error(`${name} embeddings failed`); }),
    health: vi.fn(async (): Promise<ProviderHealth> => ({
      provider: name,
      healthy: false,
      latencyMs: 0,
      error: 'down',
      checkedAt: new Date().toISOString(),
    })),
  };
}

// --- Tests ---

describe('ProviderRegistry', () => {
  it('registers and retrieves providers', () => {
    const registry = new ProviderRegistry();
    const provider = makeProvider('openai');
    registry.register(provider);

    expect(registry.has('openai')).toBe(true);
    expect(registry.get('openai')).toBe(provider);
    expect(registry.size).toBe(1);
  });

  it('throws on duplicate registration', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));
    expect(() => registry.register(makeProvider('openai'))).toThrow('already registered');
  });

  it('unregisters providers', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));
    expect(registry.unregister('openai')).toBe(true);
    expect(registry.has('openai')).toBe(false);
  });

  it('lists all models across providers', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));
    registry.register(makeProvider('claude'));

    const models = registry.allModels();
    expect(models).toHaveLength(2);
  });

  it('finds providers by capability', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));

    const chatProviders = registry.byCapability('chat');
    expect(chatProviders).toHaveLength(1);

    const visionProviders = registry.byCapability('vision');
    expect(visionProviders).toHaveLength(0);
  });

  it('finds provider by model ID', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));

    expect(registry.byModel('openai-model')?.name).toBe('openai');
    expect(registry.byModel('nonexistent')).toBeUndefined();
  });
});

describe('Router', () => {
  it('routes to explicit model', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));
    const router = new Router(registry, new HealthTracker());

    const decision = router.route({ messages: [], model: 'openai-model' });
    expect(decision.provider.name).toBe('openai');
    expect(decision.model.id).toBe('openai-model');
  });

  it('routes to preferred provider', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('openai'));
    registry.register(makeProvider('claude'));
    const router = new Router(registry, new HealthTracker());

    const decision = router.route({ messages: [] }, { preferredProvider: 'claude' });
    expect(decision.provider.name).toBe('claude');
  });

  it('routes to cheapest when no preference', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('expensive', [{
      ...defaultModel('expensive'),
      costPer1kPromptTokens: 0.01,
    }]));
    registry.register(makeProvider('cheap', [{
      ...defaultModel('cheap'),
      costPer1kPromptTokens: 0.001,
    }]));
    const router = new Router(registry, new HealthTracker());

    const decision = router.route({ messages: [] });
    expect(decision.provider.name).toBe('cheap');
  });

  it('throws NoProviderError when no match', () => {
    const registry = new ProviderRegistry();
    const router = new Router(registry, new HealthTracker());

    expect(() => router.route({ messages: [] })).toThrow(NoProviderError);
  });

  it('skips unhealthy providers', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('primary'));
    registry.register(makeProvider('backup'));
    const health = new HealthTracker();
    const router = new Router(registry, health);

    health.markUnhealthy('primary');
    const decision = router.route({ messages: [] });
    expect(decision.provider.name).toBe('backup');
  });

  it('filters by capability', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('no-vision', [{
      ...defaultModel('no-vision'),
      capabilities: ['chat'],
    }]));
    registry.register(makeProvider('has-vision', [{
      ...defaultModel('has-vision'),
      capabilities: ['chat', 'vision'],
    }]));
    const router = new Router(registry, new HealthTracker());

    const decision = router.route({ messages: [] }, { capabilities: ['vision'] });
    expect(decision.provider.name).toBe('has-vision');
  });

  it('includes filter trace in decision', () => {
    const registry = new ProviderRegistry();
    registry.register(makeProvider('test'));
    const router = new Router(registry, new HealthTracker());

    const decision = router.route({ messages: [] });
    expect(decision.filtersApplied).toContain('health');
    expect(decision.filtersApplied).toContain('capability');
    expect(decision.filtersApplied).toContain('weighted-selection');
  });
});

describe('ModelGateway', () => {
  let gateway: ModelGateway;

  beforeEach(() => {
    gateway = new ModelGateway();
    gateway.registry.register(makeProvider('primary'));
    gateway.registry.register(makeProvider('backup'));
  });

  it('sends chat request and returns response', async () => {
    const response = await gateway.chat({ messages: [{ role: 'user', content: 'hi' }] });

    expect(response.message.content).toContain('hello from');
    expect(response.provider).toBeDefined();
    expect(response.requestId).toBeDefined();
    expect(response.usage.totalTokens).toBeGreaterThan(0);
  });

  it('records telemetry on success', async () => {
    await gateway.chat({ messages: [{ role: 'user', content: 'hi' }] });

    const stats = gateway.stats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successCount).toBe(1);
  });

  it('lists available models', () => {
    const models = gateway.models();
    expect(models.length).toBeGreaterThanOrEqual(2);
  });

  it('checks provider health', async () => {
    const healthResults = await gateway.checkHealth();
    expect(healthResults).toHaveLength(2);
    expect(healthResults.every((h) => h.healthy)).toBe(true);
  });

  it('chatWithTemplate renders and sends', async () => {
    const template = createTemplate({
      name: 'test',
      system: 'You are a {{role}}.',
      user: 'Do {{task}}.',
    });

    const response = await gateway.chatWithTemplate(template, { role: 'helper', task: 'something' });
    expect(response.message.content).toBeDefined();
  });
});

describe('Prompts', () => {
  it('renders template with variables', () => {
    const template = createTemplate({
      name: 'test',
      system: 'You are a {{role}}.',
      user: 'Help with {{task}}.',
    });

    const messages = renderTemplate(template, { role: 'coder', task: 'refactoring' });
    expect(messages[0].content).toBe('You are a coder.');
    expect(messages[1].content).toBe('Help with refactoring.');
  });

  it('auto-detects variables', () => {
    const template = createTemplate({
      name: 'auto',
      system: '{{greeting}} {{name}}',
    });
    expect(template.variables).toContain('greeting');
    expect(template.variables).toContain('name');
  });

  it('throws on missing required variable', () => {
    const template = createTemplate({ name: 'strict', user: '{{required}}' });
    expect(() => renderTemplate(template, {})).toThrow(PromptRenderError);
  });
});

describe('Structured Output', () => {
  it('parses valid JSON from response', () => {
    const response: ChatResponse = {
      message: { role: 'assistant', content: '{"name": "test", "value": 42}' },
      model: 'test', provider: 'test', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0, requestId: 'x', cached: false, finishReason: 'stop',
    };

    const result = parseStructuredOutput<{ name: string; value: number }>(response);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('test');
      expect(result.data.value).toBe(42);
    }
  });

  it('extracts JSON from markdown code block', () => {
    const json = extractJson('Here is the result:\n```json\n{"key": "value"}\n```\nDone.');
    expect(json).toBe('{"key": "value"}');
  });

  it('extracts JSON from plain text', () => {
    const json = extractJson('The answer is {"result": true} as shown.');
    expect(json).toBe('{"result": true}');
  });

  it('returns undefined for non-JSON content', () => {
    expect(extractJson('just plain text')).toBeUndefined();
  });

  it('validates against schema', () => {
    const response: ChatResponse = {
      message: { role: 'assistant', content: '{"name": "test"}' },
      model: 'test', provider: 'test', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0, requestId: 'x', cached: false, finishReason: 'stop',
    };

    const schema = { required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'number' } } };
    const result = parseStructuredOutput(response, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Missing required field: value');
    }
  });
});

describe('TelemetryCollector', () => {
  it('records and reports stats', () => {
    const telemetry = new TelemetryCollector();

    telemetry.recordSuccess({
      message: { role: 'assistant', content: 'hi' },
      model: 'gpt-4', provider: 'openai',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 200, requestId: 'r1', cached: false, finishReason: 'stop',
    }, 0);

    const stats = telemetry.stats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.successCount).toBe(1);
    expect(stats.totalTokens).toBe(150);
    expect(stats.averageLatencyMs).toBe(200);
  });

  it('records failures', () => {
    const telemetry = new TelemetryCollector();

    telemetry.recordFailure({
      requestId: 'r1', provider: 'openai', model: 'gpt-4',
      latencyMs: 1000, retries: 2, error: 'timeout',
    });

    const stats = telemetry.stats();
    expect(stats.failureCount).toBe(1);
    expect(stats.retryRate).toBe(1);
  });

  it('filters by provider', () => {
    const telemetry = new TelemetryCollector();
    telemetry.recordSuccess({
      message: { role: 'assistant', content: '' }, model: 'a', provider: 'openai',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0, requestId: 'r1', cached: false, finishReason: 'stop',
    }, 0);
    telemetry.recordSuccess({
      message: { role: 'assistant', content: '' }, model: 'b', provider: 'claude',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0, requestId: 'r2', cached: false, finishReason: 'stop',
    }, 0);

    expect(telemetry.byProvider('openai')).toHaveLength(1);
    expect(telemetry.byProvider('claude')).toHaveLength(1);
  });

  it('evicts old records when over limit', () => {
    const telemetry = new TelemetryCollector(5);
    for (let i = 0; i < 10; i++) {
      telemetry.recordSuccess({
        message: { role: 'assistant', content: '' }, model: 'm', provider: 'p',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0, requestId: `r${i}`, cached: false, finishReason: 'stop',
      }, 0);
    }
    expect(telemetry.size).toBe(5);
  });
});
