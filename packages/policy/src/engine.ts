import type {
  PolicyQuestion,
  PolicyDecision,
  PolicyRule,
  PolicyConfig,
  PolicyCondition,
  PolicyContext,
} from './types.js';

/**
 * The Policy Engine.
 *
 * Evaluates questions against configured rules and returns decisions.
 * Rules are evaluated in priority order (highest first).
 * The first matching rule wins.
 *
 * The engine is stateless — all state comes from the question's context.
 * The Orchestrator asks; the Policy Engine answers.
 */
export class PolicyEngine {
  private rules: PolicyRule[];
  private defaultDecision: PolicyConfig['defaultDecision'];

  constructor(config: PolicyConfig) {
    // Sort rules by priority (highest first)
    this.rules = [...config.rules]
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);
    this.defaultDecision = config.defaultDecision;
  }

  /**
   * Evaluate a policy question and return a decision.
   */
  evaluate(question: PolicyQuestion): PolicyDecision {
    for (const rule of this.rules) {
      // Check if rule applies to this question type
      if (!rule.appliesTo.includes(question.type)) continue;

      // Check if condition matches
      if (this.matchesCondition(rule.condition, question.context)) {
        return {
          allowed: rule.decision.allowed,
          reason: rule.decision.reason,
          rule: rule.id,
          value: rule.decision.value,
          overridable: rule.decision.overridable,
        };
      }
    }

    // No rule matched — use default
    return {
      allowed: this.defaultDecision.allowed,
      reason: this.defaultDecision.reason,
      value: this.defaultDecision.value,
      overridable: this.defaultDecision.overridable,
    };
  }

  /**
   * Convenience: ask a yes/no question.
   */
  isAllowed(question: PolicyQuestion): boolean {
    return this.evaluate(question).allowed;
  }

  /**
   * Convenience: get a resource value (timeout, retries, model, etc.)
   */
  getValue<T>(question: PolicyQuestion): T | undefined {
    return this.evaluate(question).value as T | undefined;
  }

  /**
   * Get all active rules.
   */
  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Add a rule dynamically.
   */
  addRule(rule: PolicyRule): void {
    if (rule.enabled) {
      this.rules.push(rule);
      this.rules.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Remove a rule by ID.
   */
  removeRule(id: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx >= 0) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if a condition matches the given context.
   */
  private matchesCondition(condition: PolicyCondition, context: PolicyContext): boolean {
    // Always-match catch-all
    if (condition.always) return true;

    // All specified conditions must match (AND logic)
    if (condition.repository !== undefined) {
      if (!context.repository) return false;
      if (!matchPattern(context.repository, condition.repository)) return false;
    }

    if (condition.branch !== undefined) {
      if (!context.branch) return false;
      if (!matchPattern(context.branch, condition.branch)) return false;
    }

    if (condition.filePath !== undefined) {
      if (!context.filePath) return false;
      if (!matchPattern(context.filePath, condition.filePath)) return false;
    }

    if (condition.command !== undefined) {
      if (!context.command) return false;
      if (!matchPattern(context.command, condition.command)) return false;
    }

    if (condition.source !== undefined) {
      if (context.source !== condition.source) return false;
    }

    if (condition.label !== undefined) {
      if (!context.labels) return false;
      if (context.labels[condition.label.key] !== condition.label.value) return false;
    }

    // If we got here with at least one condition specified, it matched
    const hasCondition = condition.repository !== undefined
      || condition.branch !== undefined
      || condition.filePath !== undefined
      || condition.command !== undefined
      || condition.source !== undefined
      || condition.label !== undefined;

    return hasCondition;
  }
}

/**
 * Simple pattern matching (supports * wildcard and exact match).
 */
function matchPattern(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return value === pattern;

  // Convert glob pattern to regex
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
  );
  return regex.test(value);
}
