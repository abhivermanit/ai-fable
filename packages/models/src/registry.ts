import type { ModelProvider, ModelInfo, ModelCapability, ProviderHealth } from './types.js';

/**
 * Registry of available model providers.
 *
 * Providers register themselves here. The Router queries the registry
 * to find providers that match routing criteria.
 */
export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();

  /**
   * Register a provider.
   */
  register(provider: ModelProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider already registered: ${provider.name}`);
    }
    this.providers.set(provider.name, provider);
  }

  /**
   * Unregister a provider.
   */
  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * Get a provider by name.
   */
  get(name: string): ModelProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if a provider is registered.
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * List all registered provider names.
   */
  list(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Get all registered providers.
   */
  all(): ModelProvider[] {
    return [...this.providers.values()];
  }

  /**
   * Find providers that support a given capability.
   */
  byCapability(capability: ModelCapability): ModelProvider[] {
    return this.all().filter((p) =>
      p.models().some((m) => m.capabilities.includes(capability)),
    );
  }

  /**
   * Find providers that offer a specific model.
   */
  byModel(modelId: string): ModelProvider | undefined {
    return this.all().find((p) =>
      p.models().some((m) => m.id === modelId),
    );
  }

  /**
   * Get all available models across all providers.
   */
  allModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.models());
    }
    return models;
  }

  /**
   * Get models matching a capability filter.
   */
  modelsByCapability(capability: ModelCapability): ModelInfo[] {
    return this.allModels().filter((m) => m.capabilities.includes(capability));
  }

  /**
   * Check health of all providers.
   */
  async healthCheck(): Promise<ProviderHealth[]> {
    const results = await Promise.allSettled(
      this.all().map((p) => p.health()),
    );

    return results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        provider: this.list()[i],
        healthy: false,
        latencyMs: 0,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        checkedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Number of registered providers.
   */
  get size(): number {
    return this.providers.size;
  }
}
