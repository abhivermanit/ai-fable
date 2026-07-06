/**
 * A message in a chat conversation.
 */
export interface ChatMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text content */
  content: string;
  /** Tool call ID (for tool role messages) */
  toolCallId?: string;
  /** Tool calls requested by the assistant */
  toolCalls?: ToolCall[];
}

/**
 * A tool call requested by the model.
 */
export interface ToolCall {
  /** Unique ID for this call */
  id: string;
  /** Function name */
  name: string;
  /** JSON-encoded arguments */
  arguments: string;
}

/**
 * A tool definition provided to the model.
 */
export interface ToolDefinition {
  /** Tool name */
  name: string;
  /** Description for the model */
  description: string;
  /** JSON Schema for the parameters */
  parameters: Record<string, unknown>;
}

/**
 * Request to the Model Gateway for a chat completion.
 */
export interface ChatRequest {
  /** Conversation messages */
  messages: ChatMessage[];
  /** Model to use (optional — router can decide) */
  model?: string;
  /** Temperature (0–2) */
  temperature?: number;
  /** Max tokens in the response */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Tools available to the model */
  tools?: ToolDefinition[];
  /** JSON Schema for structured output */
  responseSchema?: Record<string, unknown>;
  /** Abort signal */
  signal?: AbortSignal;
  /** Request metadata (passed to telemetry) */
  metadata?: Record<string, unknown>;
}

/**
 * Response from a chat completion.
 */
export interface ChatResponse {
  /** The model's response message */
  message: ChatMessage;
  /** Which model was actually used */
  model: string;
  /** Which provider served the request */
  provider: string;
  /** Token usage */
  usage: TokenUsage;
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Unique request ID (for tracing) */
  requestId: string;
  /** Whether the response was served from cache */
  cached: boolean;
  /** Finish reason */
  finishReason: FinishReason;
}

/**
 * Token usage for a request.
 */
export interface TokenUsage {
  /** Tokens in the prompt */
  promptTokens: number;
  /** Tokens in the completion */
  completionTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Estimated cost in USD (if available) */
  estimatedCostUsd?: number;
}

/**
 * Why the model stopped generating.
 */
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';

/**
 * A chunk in a streaming response.
 */
export interface StreamChunk {
  /** Partial content delta */
  content?: string;
  /** Tool call delta */
  toolCallDelta?: Partial<ToolCall>;
  /** Whether this is the final chunk */
  done: boolean;
  /** Finish reason (only on final chunk) */
  finishReason?: FinishReason;
  /** Usage (only on final chunk, if provider reports it) */
  usage?: TokenUsage;
}

/**
 * Request for text embeddings.
 */
export interface EmbeddingRequest {
  /** Text inputs to embed */
  inputs: string[];
  /** Model to use */
  model?: string;
  /** Abort signal */
  signal?: AbortSignal;
}

/**
 * Response from an embedding request.
 */
export interface EmbeddingResponse {
  /** Embedding vectors (one per input) */
  embeddings: number[][];
  /** Model used */
  model: string;
  /** Provider used */
  provider: string;
  /** Token usage */
  usage: TokenUsage;
  /** Latency in milliseconds */
  latencyMs: number;
}

/**
 * Information about a model available through a provider.
 */
export interface ModelInfo {
  /** Model identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Provider that offers this model */
  provider: string;
  /** Capabilities this model supports */
  capabilities: ModelCapability[];
  /** Context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Cost per 1K prompt tokens in USD */
  costPer1kPromptTokens?: number;
  /** Cost per 1K completion tokens in USD */
  costPer1kCompletionTokens?: number;
}

/**
 * Model capabilities for routing decisions.
 */
export type ModelCapability =
  | 'chat'
  | 'streaming'
  | 'tool_use'
  | 'structured_output'
  | 'embeddings'
  | 'vision'
  | 'code'
  | 'long_context';

/**
 * Health status of a provider.
 */
export interface ProviderHealth {
  /** Provider name */
  provider: string;
  /** Whether the provider is currently healthy */
  healthy: boolean;
  /** Latency of the health check in ms */
  latencyMs: number;
  /** Error message if unhealthy */
  error?: string;
  /** When the health check was performed */
  checkedAt: string;
}

/**
 * The provider interface that all model adapters implement.
 *
 * The Orchestrator never sees this directly — it uses the Gateway.
 * Providers are registered in the ProviderRegistry and selected
 * by the Router.
 */
export interface ModelProvider {
  /** Unique provider name (e.g., 'openai', 'claude', 'ollama') */
  readonly name: string;

  /** Models available through this provider */
  models(): ModelInfo[];

  /** Run a chat completion */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Stream a chat completion */
  stream(request: ChatRequest): AsyncIterable<StreamChunk>;

  /** Generate embeddings */
  embeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /** Check provider health */
  health(): Promise<ProviderHealth>;
}

/**
 * Criteria for selecting a provider/model.
 */
export interface RoutingCriteria {
  /** Required capabilities */
  capabilities?: ModelCapability[];
  /** Preferred provider name */
  preferredProvider?: string;
  /** Preferred model ID */
  preferredModel?: string;
  /** Maximum acceptable cost per 1K tokens */
  maxCostPer1kTokens?: number;
  /** Maximum acceptable latency in ms */
  maxLatencyMs?: number;
  /** Minimum context window required */
  minContextWindow?: number;
}

/**
 * A telemetry record for a gateway request.
 */
export interface RequestTelemetry {
  /** Unique request ID */
  requestId: string;
  /** Provider that served the request */
  provider: string;
  /** Model used */
  model: string;
  /** Total latency in ms */
  latencyMs: number;
  /** Token usage */
  usage: TokenUsage;
  /** Number of retry attempts */
  retries: number;
  /** Whether served from cache */
  cached: boolean;
  /** Finish reason */
  finishReason: FinishReason;
  /** Error (if failed) */
  error?: string;
  /** Timestamp */
  timestamp: string;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}
