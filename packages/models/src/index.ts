// Types
export type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
  ChatRequest,
  ChatResponse,
  TokenUsage,
  FinishReason,
  StreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ModelInfo,
  ModelCapability,
  ProviderHealth,
  ModelProvider,
  RoutingCriteria,
  RequestTelemetry,
} from './types.js';

// Gateway (primary entry point)
export { ModelGateway } from './gateway.js';
export type { GatewayConfig } from './gateway.js';

// Provider Registry
export { ProviderRegistry } from './registry.js';

// Router
export { Router, NoProviderError } from './router.js';
export type { RoutingDecision } from './router.js';

// Reliability
export { ReliabilityLayer, GatewayError } from './reliability.js';
export type { ReliabilityConfig } from './reliability.js';
export { defaultReliabilityConfig } from './reliability.js';

// Telemetry
export { TelemetryCollector } from './telemetry.js';
export type { TelemetryStats } from './telemetry.js';

// Prompts
export { renderTemplate, createTemplate, PromptRenderError } from './prompts.js';
export type { PromptTemplate } from './prompts.js';

// Structured Output
export { parseStructuredOutput, extractJson } from './structured-output.js';
export type { StructuredOutput } from './structured-output.js';
