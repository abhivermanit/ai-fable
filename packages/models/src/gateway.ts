import { randomUUID } from 'node:crypto';
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  ProviderHealth,
  RoutingCriteria,
  StreamChunk,
} from './types.js';
import { ProviderRegistry } from './registry.js';
import { Router } from './router.js';
import { ReliabilityLayer, GatewayError } from './reliability.js';
import type { ReliabilityConfig } from './reliability.js';
import { TelemetryCollector } from './telemetry.js';
import type { TelemetryStats } from './telemetry.js';
import type { PromptTemplate } from './prompts.js';
import { renderTemplate } from './prompts.js';
import { parseStructuredOutput, type StructuredOutput } from './structured-output.js';

/**
 * Configuration for the Model Gateway.
 */
export interface GatewayConfig {
  /** Reliability configuration overrides */
  reliability?: Partial<ReliabilityConfig>;
  /** Default routing criteria */
  defaultCriteria?: RoutingCriteria;
  /** Maximum telemetry records to keep */
  maxTelemetryRecords?: number;
}

/**
 * The Model Gateway.
 *
 * This is the single entry point for all LLM interactions in AI-Fable.
 * The Orchestrator calls `gateway.chat(...)` — everything else
 * (provider selection, routing, retries, fallback, telemetry) is internal.
 *
 * The Orchestrator never knows whether the request went to OpenAI,
 * Claude, Gemini, or a local model.
 */
export class ModelGateway {
  public readonly registry: ProviderRegistry;
  public readonly router: Router;
  public readonly telemetry: TelemetryCollector;
  private readonly reliability: ReliabilityLayer;
  private readonly defaultCriteria?: RoutingCriteria;

  constructor(config?: GatewayConfig) {
    this.registry = new ProviderRegistry();
    this.router = new Router(this.registry);
    this.telemetry = new TelemetryCollector(config?.maxTelemetryRecords);
    this.reliability = new ReliabilityLayer(this.router, config?.reliability);
    this.defaultCriteria = config?.defaultCriteria;
  }

  /**
   * Send a chat request through the gateway.
   *
   * This is the primary API. The Orchestrator uses this for all LLM calls.
   */
  async chat(request: ChatRequest, criteria?: RoutingCriteria): Promise<ChatResponse> {
    const mergedCriteria = { ...this.defaultCriteria, ...criteria };
    const startTime = Date.now();
    const requestId = randomUUID();

    // Route to best provider
    const decision = this.router.route(request, mergedCriteria);

    try {
      const response = await this.reliability.execute(request, decision.provider, mergedCriteria);

      // Enrich response with gateway metadata
      const enriched: ChatResponse = {
        ...response,
        requestId,
        latencyMs: Date.now() - startTime,
      };

      // Record telemetry
      this.telemetry.recordSuccess(enriched, 0, request.metadata);

      return enriched;
    } catch (error) {
      // Record failure telemetry
      this.telemetry.recordFailure({
        requestId,
        provider: decision.provider.name,
        model: decision.model.id,
        latencyMs: Date.now() - startTime,
        retries: error instanceof GatewayError ? error.attempts : 0,
        error: error instanceof Error ? error.message : String(error),
        metadata: request.metadata,
      });

      throw error;
    }
  }

  /**
   * Send a chat request using a prompt template.
   */
  async chatWithTemplate(
    template: PromptTemplate,
    variables: Record<string, string>,
    criteria?: RoutingCriteria,
  ): Promise<ChatResponse> {
    const messages = renderTemplate(template, variables);
    return this.chat({
      messages,
      tools: template.tools,
      responseSchema: template.outputSchema,
    }, criteria);
  }

  /**
   * Send a chat request and parse structured JSON output.
   */
  async chatStructured<T>(
    request: ChatRequest,
    schema?: Record<string, unknown>,
    criteria?: RoutingCriteria,
  ): Promise<StructuredOutput<T>> {
    const response = await this.chat(
      { ...request, responseSchema: schema },
      criteria,
    );
    return parseStructuredOutput<T>(response, schema);
  }

  /**
   * Stream a chat response.
   *
   * Returns an async iterable of chunks. The caller consumes them
   * as they arrive.
   */
  async *stream(request: ChatRequest, criteria?: RoutingCriteria): AsyncIterable<StreamChunk> {
    const mergedCriteria = { ...this.defaultCriteria, ...criteria };
    const decision = this.router.route(request, mergedCriteria);

    yield* decision.provider.stream(request);
  }

  /**
   * Generate embeddings.
   */
  async embeddings(request: EmbeddingRequest, criteria?: RoutingCriteria): Promise<EmbeddingResponse> {
    const mergedCriteria = {
      ...this.defaultCriteria,
      ...criteria,
      capabilities: ['embeddings' as const],
    };
    const decision = this.router.route(
      { messages: [], model: request.model },
      mergedCriteria,
    );
    return decision.provider.embeddings(request);
  }

  /**
   * List all available models.
   */
  models(): ModelInfo[] {
    return this.registry.allModels();
  }

  /**
   * Check health of all providers.
   */
  async health(): Promise<ProviderHealth[]> {
    return this.registry.healthCheck();
  }

  /**
   * Get telemetry statistics.
   */
  stats(): TelemetryStats {
    return this.telemetry.stats();
  }
}
