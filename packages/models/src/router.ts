import type { ModelProvider, ModelInfo, RoutingCriteria, ChatRequest } from './types.js';
import type { ProviderRegistry } from './registry.js';

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
}

/**
 * The Router selects the best provider and model for a request.
 *
 * Selection is based on:
 * - Required capabilities
 * - Preferred provider/model (if specified)
 * - Cost constraints
 * - Context window requirements
 * - Provider health
 *
 * The router does NOT execute requests — it only decides where to send them.
 */
export class Router {
  private readonly registry: ProviderRegistry;
  private readonly unhealthyProviders: Set<string> = new Set();

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Select the best provider and model for a request.
   */
  route(request: ChatRequest, criteria?: RoutingCriteria): RoutingDecision {
    // If a specific model is requested, find it directly
    if (request.model) {
      const decision = this.findByModel(request.model);
      if (decision) return decision;
    }

    // If preferred provider specified, try it first
    if (criteria?.preferredProvider) {
      const decision = this.findByProvider(criteria.preferredProvider, criteria);
      if (decision) return decision;
    }

    // If preferred model specified, find it
    if (criteria?.preferredModel) {
      const decision = this.findByModel(criteria.preferredModel);
      if (decision) return decision;
    }

    // General routing: find best match across all providers
    const candidates = this.findCandidates(criteria);
    if (candidates.length === 0) {
      throw new NoProviderError(criteria);
    }

    // Select best candidate (cheapest that meets requirements)
    const best = this.selectBest(candidates, criteria);
    return best;
  }

  /**
   * Mark a provider as unhealthy (for circuit breaker / fallback).
   */
  markUnhealthy(providerName: string): void {
    this.unhealthyProviders.add(providerName);
  }

  /**
   * Mark a provider as healthy again.
   */
  markHealthy(providerName: string): void {
    this.unhealthyProviders.delete(providerName);
  }

  /**
   * Check if a provider is considered healthy.
   */
  isHealthy(providerName: string): boolean {
    return !this.unhealthyProviders.has(providerName);
  }

  /**
   * Find a specific model by ID across all providers.
   */
  private findByModel(modelId: string): RoutingDecision | undefined {
    const provider = this.registry.byModel(modelId);
    if (!provider) return undefined;
    if (!this.isHealthy(provider.name)) return undefined;

    const model = provider.models().find((m) => m.id === modelId);
    if (!model) return undefined;

    return { provider, model, reason: `Explicit model selection: ${modelId}` };
  }

  /**
   * Find a model from a specific provider matching criteria.
   */
  private findByProvider(providerName: string, criteria?: RoutingCriteria): RoutingDecision | undefined {
    const provider = this.registry.get(providerName);
    if (!provider) return undefined;
    if (!this.isHealthy(providerName)) return undefined;

    const models = this.filterModels(provider.models(), criteria);
    if (models.length === 0) return undefined;

    const best = models[0]; // First match (models should be pre-sorted by provider)
    return { provider, model: best, reason: `Preferred provider: ${providerName}` };
  }

  /**
   * Find all candidate models across all healthy providers.
   */
  private findCandidates(criteria?: RoutingCriteria): Array<{ provider: ModelProvider; model: ModelInfo }> {
    const candidates: Array<{ provider: ModelProvider; model: ModelInfo }> = [];

    for (const provider of this.registry.all()) {
      if (!this.isHealthy(provider.name)) continue;

      const models = this.filterModels(provider.models(), criteria);
      for (const model of models) {
        candidates.push({ provider, model });
      }
    }

    return candidates;
  }

  /**
   * Filter models by routing criteria.
   */
  private filterModels(models: ModelInfo[], criteria?: RoutingCriteria): ModelInfo[] {
    if (!criteria) return models;

    return models.filter((m) => {
      // Check required capabilities
      if (criteria.capabilities) {
        for (const cap of criteria.capabilities) {
          if (!m.capabilities.includes(cap)) return false;
        }
      }

      // Check context window
      if (criteria.minContextWindow && m.contextWindow < criteria.minContextWindow) {
        return false;
      }

      // Check cost
      if (criteria.maxCostPer1kTokens && m.costPer1kPromptTokens) {
        if (m.costPer1kPromptTokens > criteria.maxCostPer1kTokens) return false;
      }

      return true;
    });
  }

  /**
   * Select the best candidate from a list (cheapest, or first if no cost info).
   */
  private selectBest(
    candidates: Array<{ provider: ModelProvider; model: ModelInfo }>,
    criteria?: RoutingCriteria,
  ): RoutingDecision {
    // Sort by cost (cheapest first), then by context window (larger first)
    const sorted = [...candidates].sort((a, b) => {
      const costA = a.model.costPer1kPromptTokens ?? Infinity;
      const costB = b.model.costPer1kPromptTokens ?? Infinity;
      if (costA !== costB) return costA - costB;
      return b.model.contextWindow - a.model.contextWindow;
    });

    return {
      provider: sorted[0].provider,
      model: sorted[0].model,
      reason: 'Best match by cost and capability',
    };
  }
}

/**
 * Error thrown when no provider can serve a request.
 */
export class NoProviderError extends Error {
  public readonly criteria?: RoutingCriteria;

  constructor(criteria?: RoutingCriteria) {
    const caps = criteria?.capabilities?.join(', ') ?? 'any';
    super(`No healthy provider found matching criteria (capabilities: ${caps})`);
    this.name = 'NoProviderError';
    this.criteria = criteria;
  }
}
