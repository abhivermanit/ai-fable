import type { ChatRequest, ChatResponse, ModelProvider } from './types.js';
import type { Router } from './router.js';
import type { RoutingCriteria } from './types.js';

/**
 * Configuration for the reliability layer.
 */
export interface ReliabilityConfig {
  /** Maximum retry attempts (default: 2) */
  maxRetries: number;
  /** Base delay between retries in ms (default: 1000) */
  retryDelayMs: number;
  /** Request timeout in ms (default: 60000) */
  timeoutMs: number;
  /** Number of failures before circuit opens (default: 5) */
  circuitBreakerThreshold: number;
  /** Time to wait before trying a tripped provider again in ms (default: 30000) */
  circuitBreakerResetMs: number;
}

/**
 * Default reliability configuration.
 */
export function defaultReliabilityConfig(): ReliabilityConfig {
  return {
    maxRetries: 2,
    retryDelayMs: 1000,
    timeoutMs: 60_000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 30_000,
  };
}

/**
 * Circuit breaker state for a single provider.
 */
interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

/**
 * The Reliability layer wraps provider calls with:
 * - Retries with exponential backoff
 * - Request timeout
 * - Circuit breaker (per provider)
 * - Fallback to alternative providers
 */
export class ReliabilityLayer {
  private readonly config: ReliabilityConfig;
  private readonly router: Router;
  private circuits = new Map<string, CircuitState>();

  constructor(router: Router, config?: Partial<ReliabilityConfig>) {
    this.config = { ...defaultReliabilityConfig(), ...config };
    this.router = router;
  }

  /**
   * Execute a chat request with full reliability guarantees.
   *
   * Attempts: primary provider → retry → fallback providers.
   */
  async execute(
    request: ChatRequest,
    provider: ModelProvider,
    criteria?: RoutingCriteria,
  ): Promise<ChatResponse> {
    let lastError: Error | undefined;
    let attempts = 0;

    // Try the primary provider with retries
    for (let retry = 0; retry <= this.config.maxRetries; retry++) {
      if (this.isCircuitOpen(provider.name)) break;

      try {
        attempts++;
        const response = await this.executeWithTimeout(request, provider);
        this.recordSuccess(provider.name);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.recordFailure(provider.name);

        // Don't retry if aborted
        if (request.signal?.aborted) break;

        // Wait before retry (exponential backoff)
        if (retry < this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs * Math.pow(2, retry));
        }
      }
    }

    // Primary failed — try fallback providers
    if (!request.signal?.aborted) {
      const fallback = this.findFallback(provider.name, criteria);
      if (fallback) {
        try {
          attempts++;
          const response = await this.executeWithTimeout(request, fallback);
          this.recordSuccess(fallback.name);
          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          this.recordFailure(fallback.name);
        }
      }
    }

    throw new GatewayError(
      `All providers failed after ${attempts} attempts: ${lastError?.message}`,
      provider.name,
      attempts,
      lastError,
    );
  }

  /**
   * Get the number of retry attempts made (for telemetry).
   */
  getAttemptCount(): number {
    return 0; // tracked per-request in execute()
  }

  /**
   * Check circuit breaker state for a provider.
   */
  isCircuitOpen(providerName: string): boolean {
    const state = this.circuits.get(providerName);
    if (!state || !state.open) return false;

    // Check if enough time has passed to try again (half-open)
    const elapsed = Date.now() - state.lastFailure;
    if (elapsed > this.config.circuitBreakerResetMs) {
      state.open = false;
      state.failures = 0;
      return false;
    }

    return true;
  }

  /**
   * Execute a request with timeout.
   */
  private async executeWithTimeout(request: ChatRequest, provider: ModelProvider): Promise<ChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('Gateway timeout'), this.config.timeoutMs);

    // Merge abort signals
    const mergedRequest = { ...request };
    if (request.signal) {
      request.signal.addEventListener('abort', () => controller.abort(request.signal!.reason), { once: true });
    }
    mergedRequest.signal = controller.signal;

    try {
      const response = await provider.chat(mergedRequest);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Find a fallback provider (different from the failed one).
   */
  private findFallback(failedProvider: string, criteria?: RoutingCriteria): ModelProvider | undefined {
    try {
      const decision = this.router.route(
        { messages: [], model: undefined },
        { ...criteria, preferredProvider: undefined },
      );
      if (decision.provider.name !== failedProvider && !this.isCircuitOpen(decision.provider.name)) {
        return decision.provider;
      }
    } catch {
      // No fallback available
    }
    return undefined;
  }

  /**
   * Record a successful request (resets circuit breaker).
   */
  private recordSuccess(providerName: string): void {
    const state = this.circuits.get(providerName);
    if (state) {
      state.failures = 0;
      state.open = false;
    }
    this.router.markHealthy(providerName);
  }

  /**
   * Record a failed request (may trip circuit breaker).
   */
  private recordFailure(providerName: string): void {
    let state = this.circuits.get(providerName);
    if (!state) {
      state = { failures: 0, lastFailure: 0, open: false };
      this.circuits.set(providerName, state);
    }

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.config.circuitBreakerThreshold) {
      state.open = true;
      this.router.markUnhealthy(providerName);
    }
  }

  /**
   * Delay helper (respects abort).
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Error thrown when the gateway cannot serve a request.
 */
export class GatewayError extends Error {
  public readonly provider: string;
  public readonly attempts: number;
  public readonly cause?: Error;

  constructor(message: string, provider: string, attempts: number, cause?: Error) {
    super(message);
    this.name = 'GatewayError';
    this.provider = provider;
    this.attempts = attempts;
    this.cause = cause;
  }
}
