/**
 * Health status for a single provider.
 */
export interface ProviderHealthState {
  /** Provider name */
  provider: string;
  /** Whether currently considered healthy */
  healthy: boolean;
  /** Recent latency measurements (ms) */
  recentLatencies: number[];
  /** Average latency over recent requests */
  averageLatencyMs: number;
  /** Total successful requests */
  successCount: number;
  /** Total failed requests */
  failureCount: number;
  /** Failure rate (0–1) */
  failureRate: number;
  /** Consecutive failures (for circuit breaking) */
  consecutiveFailures: number;
  /** Last successful request timestamp */
  lastSuccess?: string;
  /** Last failure timestamp */
  lastFailure?: string;
  /** Circuit breaker state */
  circuitState: 'closed' | 'open' | 'half-open';
}

/**
 * Configuration for the health tracker.
 */
export interface HealthTrackerConfig {
  /** Failures before circuit opens (default: 5) */
  circuitBreakerThreshold: number;
  /** Time before half-open attempt in ms (default: 30000) */
  circuitResetMs: number;
  /** Number of latency samples to keep (default: 50) */
  latencySampleSize: number;
  /** Failure rate threshold to mark unhealthy (default: 0.5) */
  unhealthyFailureRate: number;
}

function defaultHealthConfig(): HealthTrackerConfig {
  return {
    circuitBreakerThreshold: 5,
    circuitResetMs: 30_000,
    latencySampleSize: 50,
    unhealthyFailureRate: 0.5,
  };
}

/**
 * Tracks provider health metrics and circuit breaker state.
 *
 * The Router uses this to exclude unhealthy providers.
 * The ReliabilityLayer updates it on success/failure.
 *
 * Tracks per provider:
 * - Latency (rolling window)
 * - Availability (success/failure counts)
 * - Failure rate
 * - Consecutive failures
 * - Circuit breaker state (closed → open → half-open → closed)
 */
export class HealthTracker {
  private states = new Map<string, ProviderHealthState>();
  private config: HealthTrackerConfig;

  constructor(config?: Partial<HealthTrackerConfig>) {
    this.config = { ...defaultHealthConfig(), ...config };
  }

  /**
   * Record a successful request to a provider.
   */
  recordSuccess(provider: string, latencyMs: number): void {
    const state = this.getOrCreate(provider);
    state.successCount++;
    state.consecutiveFailures = 0;
    state.lastSuccess = new Date().toISOString();
    this.addLatency(state, latencyMs);
    this.updateHealth(state);
  }

  /**
   * Record a failed request to a provider.
   */
  recordFailure(provider: string): void {
    const state = this.getOrCreate(provider);
    state.failureCount++;
    state.consecutiveFailures++;
    state.lastFailure = new Date().toISOString();
    this.updateHealth(state);
  }

  /**
   * Check if a provider is considered healthy.
   */
  isHealthy(provider: string): boolean {
    const state = this.states.get(provider);
    if (!state) return true; // Unknown providers assumed healthy

    // Half-open: allow one attempt
    if (state.circuitState === 'open') {
      const elapsed = Date.now() - new Date(state.lastFailure ?? 0).getTime();
      if (elapsed > this.config.circuitResetMs) {
        state.circuitState = 'half-open';
        return true;
      }
      return false;
    }

    return state.healthy;
  }

  /**
   * Manually mark a provider unhealthy.
   */
  markUnhealthy(provider: string): void {
    const state = this.getOrCreate(provider);
    state.healthy = false;
    state.circuitState = 'open';
    state.lastFailure = new Date().toISOString();
  }

  /**
   * Manually mark a provider healthy.
   */
  markHealthy(provider: string): void {
    const state = this.getOrCreate(provider);
    state.healthy = true;
    state.circuitState = 'closed';
    state.consecutiveFailures = 0;
  }

  /**
   * Get health state for a provider.
   */
  getState(provider: string): ProviderHealthState | undefined {
    return this.states.get(provider);
  }

  /**
   * Get health states for all tracked providers.
   */
  allStates(): ProviderHealthState[] {
    return [...this.states.values()];
  }

  /**
   * Reset all health state (for testing).
   */
  reset(): void {
    this.states.clear();
  }

  private getOrCreate(provider: string): ProviderHealthState {
    let state = this.states.get(provider);
    if (!state) {
      state = {
        provider,
        healthy: true,
        recentLatencies: [],
        averageLatencyMs: 0,
        successCount: 0,
        failureCount: 0,
        failureRate: 0,
        consecutiveFailures: 0,
        circuitState: 'closed',
      };
      this.states.set(provider, state);
    }
    return state;
  }

  private addLatency(state: ProviderHealthState, latencyMs: number): void {
    state.recentLatencies.push(latencyMs);
    if (state.recentLatencies.length > this.config.latencySampleSize) {
      state.recentLatencies.shift();
    }
    state.averageLatencyMs = Math.round(
      state.recentLatencies.reduce((a, b) => a + b, 0) / state.recentLatencies.length,
    );
  }

  private updateHealth(state: ProviderHealthState): void {
    const total = state.successCount + state.failureCount;
    state.failureRate = total > 0 ? state.failureCount / total : 0;

    // Circuit breaker logic
    if (state.consecutiveFailures >= this.config.circuitBreakerThreshold) {
      state.circuitState = 'open';
      state.healthy = false;
    } else if (state.circuitState === 'half-open' && state.consecutiveFailures === 0) {
      // Half-open succeeded — close circuit
      state.circuitState = 'closed';
      state.healthy = true;
    } else if (state.circuitState === 'closed') {
      state.healthy = state.failureRate < this.config.unhealthyFailureRate;
    }
  }
}
