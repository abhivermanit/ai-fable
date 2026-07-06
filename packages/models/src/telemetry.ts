import type { RequestTelemetry, ChatResponse, TokenUsage } from './types.js';

/**
 * Telemetry collector for model gateway requests.
 *
 * Records every request with: provider, model, latency, tokens, cost,
 * retries, cache status, and failure reasons.
 *
 * This data supports:
 * - Cost tracking and budgeting
 * - Provider performance comparison
 * - Reliability monitoring
 * - Usage dashboards
 */
export class TelemetryCollector {
  private records: RequestTelemetry[] = [];
  private maxRecords: number;

  constructor(maxRecords: number = 10_000) {
    this.maxRecords = maxRecords;
  }

  /**
   * Record a successful request.
   */
  recordSuccess(response: ChatResponse, retries: number, metadata?: Record<string, unknown>): void {
    this.addRecord({
      requestId: response.requestId,
      provider: response.provider,
      model: response.model,
      latencyMs: response.latencyMs,
      usage: response.usage,
      retries,
      cached: response.cached,
      finishReason: response.finishReason,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Record a failed request.
   */
  recordFailure(params: {
    requestId: string;
    provider: string;
    model: string;
    latencyMs: number;
    retries: number;
    error: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.addRecord({
      requestId: params.requestId,
      provider: params.provider,
      model: params.model,
      latencyMs: params.latencyMs,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      retries: params.retries,
      cached: false,
      finishReason: 'error',
      error: params.error,
      timestamp: new Date().toISOString(),
      metadata: params.metadata,
    });
  }

  /**
   * Get all telemetry records.
   */
  getRecords(): RequestTelemetry[] {
    return [...this.records];
  }

  /**
   * Get records filtered by provider.
   */
  byProvider(provider: string): RequestTelemetry[] {
    return this.records.filter((r) => r.provider === provider);
  }

  /**
   * Get records filtered by model.
   */
  byModel(model: string): RequestTelemetry[] {
    return this.records.filter((r) => r.model === model);
  }

  /**
   * Get aggregate statistics.
   */
  stats(): TelemetryStats {
    if (this.records.length === 0) {
      return {
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        averageLatencyMs: 0,
        cacheHitRate: 0,
        retryRate: 0,
      };
    }

    const successes = this.records.filter((r) => !r.error);
    const failures = this.records.filter((r) => !!r.error);
    const totalTokens = this.records.reduce((sum, r) => sum + r.usage.totalTokens, 0);
    const totalCost = this.records.reduce((sum, r) => sum + (r.usage.estimatedCostUsd ?? 0), 0);
    const avgLatency = this.records.reduce((sum, r) => sum + r.latencyMs, 0) / this.records.length;
    const cacheHits = this.records.filter((r) => r.cached).length;
    const retried = this.records.filter((r) => r.retries > 0).length;

    return {
      totalRequests: this.records.length,
      successCount: successes.length,
      failureCount: failures.length,
      totalTokens,
      totalCostUsd: totalCost,
      averageLatencyMs: Math.round(avgLatency),
      cacheHitRate: cacheHits / this.records.length,
      retryRate: retried / this.records.length,
    };
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records = [];
  }

  /**
   * Number of stored records.
   */
  get size(): number {
    return this.records.length;
  }

  private addRecord(record: RequestTelemetry): void {
    this.records.push(record);
    // Evict oldest records if over limit
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }
}

/**
 * Aggregate telemetry statistics.
 */
export interface TelemetryStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  cacheHitRate: number;
  retryRate: number;
}
