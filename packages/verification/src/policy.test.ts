import { describe, it, expect } from 'vitest';
import { defaultPolicy, strictPolicy, createPolicy, mergePolicy } from './policy.js';

describe('policy', () => {
  describe('defaultPolicy', () => {
    it('has build, typecheck, tests as required; lint as advisory', () => {
      const policy = defaultPolicy();
      expect(policy.requireAll).toBe(true);

      const build = policy.rules.find((r) => r.verifier === 'build');
      const typecheck = policy.rules.find((r) => r.verifier === 'typecheck');
      const tests = policy.rules.find((r) => r.verifier === 'tests');
      const lint = policy.rules.find((r) => r.verifier === 'lint');

      expect(build?.required).toBe(true);
      expect(typecheck?.required).toBe(true);
      expect(tests?.required).toBe(true);
      expect(lint?.required).toBe(false);
    });
  });

  describe('strictPolicy', () => {
    it('makes all listed verifiers required', () => {
      const policy = strictPolicy(['build', 'tests', 'lint', 'security']);
      expect(policy.rules).toHaveLength(4);
      expect(policy.rules.every((r) => r.required)).toBe(true);
    });
  });

  describe('createPolicy', () => {
    it('creates a policy from rules', () => {
      const policy = createPolicy([
        { verifier: 'build', required: true },
        { verifier: 'lint', required: false },
      ]);

      expect(policy.requireAll).toBe(true);
      expect(policy.rules).toHaveLength(2);
    });

    it('accepts requireAll override', () => {
      const policy = createPolicy([], false);
      expect(policy.requireAll).toBe(false);
    });
  });

  describe('mergePolicy', () => {
    it('overrides existing rules by verifier name', () => {
      const base = defaultPolicy();
      const merged = mergePolicy(base, {
        rules: [{ verifier: 'lint', required: true }],
      });

      const lint = merged.rules.find((r) => r.verifier === 'lint');
      expect(lint?.required).toBe(true);
    });

    it('adds new rules from override', () => {
      const base = defaultPolicy();
      const merged = mergePolicy(base, {
        rules: [{ verifier: 'security', required: true }],
      });

      expect(merged.rules.find((r) => r.verifier === 'security')).toBeDefined();
      expect(merged.rules.length).toBe(base.rules.length + 1);
    });

    it('overrides requireAll', () => {
      const base = defaultPolicy();
      const merged = mergePolicy(base, { requireAll: false });
      expect(merged.requireAll).toBe(false);
    });

    it('preserves base when no overrides', () => {
      const base = defaultPolicy();
      const merged = mergePolicy(base, {});
      expect(merged).toEqual(base);
    });
  });
});
