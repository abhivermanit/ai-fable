import type { ModelProvider, ModelInfo, RoutingCriteria, ChatRequest } from './types.js';
import type { ProviderRegistry } from './registry.js';
import type { HealthTracker } from './health.js';

/**
 * A candidate (provider + model pair) flowing through the pipeline.
 */
export interface RouteCandidate {
  provider: ModelProvider;
  model: ModelInfo;
}

/**
 * Result of a routing decision.
 */
export interface RoutingDecision {
  /** Selected provider */
  provider: ModelProvider;
  /** Selected model */
  model: ModelInfo;
  /** Reason for the selection */
  reason: string;
  /** Filters that were applied */
  filtersApplied: string[];
}

/**
 * A routing filter — one stage in the pipeline.
 *
 * Each filter receives candidates and returns a subset.
 * Adding new routing logic is as simple as adding a new filter.
 */
export interface RouteFilter {
  /** Filter name (for tracing/debugging) */
  readonly name: string;
  /** Apply the filter, returning candidates that pass. */
  apply(candidates: RouteCandidate[], request: ChatRequest, criteria?: RoutingCriteria): RouteCandidate[];
}

// --- Built-in Filters ---

/**
 * Removes unhealthy providers.
 */
export class HealthFilter implements RouteFilter {
  readonly name = 'health';
  private readonly healthTracker: HealthTracker;

  constructor(healthTracker: HealthTracker) {
    this.healthTracker = healthTracker;
  }

  apply(candidates: RouteCandidate[]): RouteCandidate[] {
    return candidates.filter((c) => this.healthTracker.isHealthy(c.provider.name));
  }
}

/**
 * Filters by required capabilities.
 */
export class CapabilityFilter implements RouteFilter {
  readonly name = 'capability';

  apply(candidates: RouteCandidate[], _request: ChatRequest, criteria?: RoutingCriteria): RouteCandidate[] {
    if (!criteria?.capabilities || criteria.capabilities.length === 0) return candidates;

    return candidates.filter((c) =>
      criteria.capabilities!.every((cap) => c.model.capabilities.includes(cap)),
    );
  }
}

/**
 * Filters by minimum context window.
 */
export class ContextWindowFilter implements RouteFilter {
  readonly name = 'context-window';

  apply(candidates: RouteCandidate[], _request: ChatRequest, criteria?: RoutingCriteria): RouteCandidate[] {
    if (!criteria?.minContextWindow) return candidates;
    return candidates.filter((c) => c.model.contextWindow >= criteria.minContextWindow!);
  }
}

/**
 * Filters by maximum cost.
 */
export class CostFilter implements RouteFilter {
  readonly name = 'cost';

  apply(candidates: RouteCandidate[], _request: ChatRequest, criteria?: RoutingCriteria): RouteCandidate[] {
    if (!criteria?.maxCostPer1kTokens) return candidates;
    return candidates.filter((c) =>
      !c.model.costPer1kPromptTokens || c.model.costPer1kPromptTokens <= criteria.maxCostPer1kTokens!,
    );
  }
}

/**
 * Promotes preferred provider/model to the front.
 */
export class PreferenceFilter implements RouteFilter {
  readonly name = 'preference';

  apply(candidates: RouteCandidate[], request: ChatRequest, criteria?: RoutingCriteria): RouteCandidate[] {
    if (candidates.length <= 1) return candidates;

    // Explicit model in request takes highest priority
    if (request.model) {
      const exact = candidates.filter((c) => c.model.id === request.model);
      if (exact.length > 0) return exact;
    }

    // Preferred model from criteria
    if (criteria?.preferredModel) {
      const preferred = candidates.filter((c) => c.model.id === criteria.preferredModel);
      if (preferred.length > 0) return preferred;
    }

    // Preferred provider from criteria
    if (criteria?.preferredProvider) {
      const preferred = candidates.filter((c) => c.provider.name === criteria.preferredProvider);
      if (preferred.length > 0) return preferred;
    }

    return candidates;
  }
}

/**
 * Sorts remaining candidates by cost (cheapest first), then context window.
 */
export class WeightedSelectionFilter implements RouteFilter {
  readonly name = 'weighted-selection';

  apply(candidates: RouteCandidate[]): RouteCandidate[] {
    return [...candidates].sort((a, b) => {
      const costA = a.model.costPer1kPromptTokens ?? Infinity;
      const costB = b.model.costPer1kPromptTokens ?? Infinity;
      if (costA !== costB) return costA - costB;
      return b.model.contextWindow - a.model.contextWindow;
    });
  }
}

// --- Router ---

/**
 * The Router selects the best provider and model for a request.
 *
 * Uses a filter pipeline architecture:
 *   All candidates → Health → Capability → Context → Cost → Preference → Selection
 *
 * Each filter narrows the candidate set. Adding new routing logic is
 * as simple as inserting a filter into the pipeline.
 *
 * The router never references provider names in its logic —
 * all decisions are based on capabilities and metadata.
 */
export class Router {
  private readonly registry: ProviderRegistry;
  private readonly pipeline: RouteFilter[];
  private readonly healthTracker: HealthTracker;

  constructor(registry: ProviderRegistry, healthTracker: HealthTracker, additionalFilters?: RouteFilter[]) {
    this.registry = registry;
    this.healthTracker = healthTracker;

    // Default pipeline
    this.pipeline = [
      new HealthFilter(healthTracker),
      new CapabilityFilter(),
      new ContextWindowFilter(),
      new CostFilter(),
      new PreferenceFilter(),
      new WeightedSelectionFilter(),
      ...(additionalFilters ?? []),
    ];
  }

  /**
   * Select the best provider and model for a request.
   */
  route(request: ChatRequest, criteria?: RoutingCriteria): RoutingDecision {
    // Start with all registered models as candidates
    let candidates: RouteCandidate[] = [];
    for (const provider of this.registry.all()) {
      for (const model of provider.models()) {
        candidates.push({ provider, model });
      }
    }

    if (candidates.length === 0) {
      throw new NoProviderError(criteria);
    }

    // Run through filter pipeline
    const filtersApplied: string[] = [];
    for (const filter of this.pipeline) {
      const before = candidates.length;
      candidates = filter.apply(candidates, request, criteria);
      filtersApplied.push(filter.name);

      if (candidates.length === 0) {
        throw new NoProviderError(criteria, filter.name);
      }
    }

    // Take the first candidate (pipeline should have sorted them)
    const selected = candidates[0];
    return {
      provider: selected.provider,
      model: selected.model,
      reason: `Selected by pipeline (${filtersApplied.join(' → ')})`,
      filtersApplied,
    };
  }

  /**
   * Get the filter pipeline (for inspection/debugging).
   */
  getFilters(): RouteFilter[] {
    return [...this.pipeline];
  }

  /**
   * Convenience: mark a provider unhealthy.
   */
  markUnhealthy(providerName: string): void {
    this.healthTracker.markUnhealthy(providerName);
  }

  /**
   * Convenience: mark a provider healthy.
   */
  markHealthy(providerName: string): void {
    this.healthTracker.markHealthy(providerName);
  }

  /**
   * Convenience: check health.
   */
  isHealthy(providerName: string): boolean {
    return this.healthTracker.isHealthy(providerName);
  }
}

/**
 * Error thrown when no provider can serve a request.
 */
export class NoProviderError extends Error {
  public readonly criteria?: RoutingCriteria;
  public readonly failedAtFilter?: string;

  constructor(criteria?: RoutingCriteria, failedAtFilter?: string) {
    const caps = criteria?.capabilities?.join(', ') ?? 'any';
    const filterMsg = failedAtFilter ? ` (failed at: ${failedAtFilter})` : '';
    super(`No provider found matching criteria (capabilities: ${caps})${filterMsg}`);
    this.name = 'NoProviderError';
    this.criteria = criteria;
    this.failedAtFilter = failedAtFilter;
  }
}
