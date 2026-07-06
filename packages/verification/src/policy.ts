import type { AcceptancePolicy, AcceptanceRule } from './types.js';

/**
 * Create a default acceptance policy.
 *
 * Default: build, typecheck, and tests are required; lint is advisory.
 */
export function defaultPolicy(): AcceptancePolicy {
  return {
    requireAll: true,
    rules: [
      { verifier: 'build', required: true, description: 'Build must pass' },
      { verifier: 'typecheck', required: true, description: 'No type errors' },
      { verifier: 'tests', required: true, description: 'Tests must pass' },
      { verifier: 'lint', required: false, description: 'No new lint errors (advisory)' },
    ],
  };
}

/**
 * Create a strict policy where all verifiers are required.
 */
export function strictPolicy(verifierNames: string[]): AcceptancePolicy {
  return {
    requireAll: true,
    rules: verifierNames.map((name) => ({
      verifier: name,
      required: true,
    })),
  };
}

/**
 * Create a custom policy from rules.
 */
export function createPolicy(rules: AcceptanceRule[], requireAll: boolean = true): AcceptancePolicy {
  return { rules, requireAll };
}

/**
 * Merge two policies (useful for per-project overrides).
 */
export function mergePolicy(base: AcceptancePolicy, override: Partial<AcceptancePolicy>): AcceptancePolicy {
  const rules = override.rules
    ? mergeRules(base.rules, override.rules)
    : base.rules;

  return {
    requireAll: override.requireAll ?? base.requireAll,
    rules,
  };
}

/**
 * Merge rule lists: override rules replace base rules with the same verifier name.
 */
function mergeRules(base: AcceptanceRule[], override: AcceptanceRule[]): AcceptanceRule[] {
  const result = [...base];
  for (const rule of override) {
    const idx = result.findIndex((r) => r.verifier === rule.verifier);
    if (idx >= 0) {
      result[idx] = rule;
    } else {
      result.push(rule);
    }
  }
  return result;
}
