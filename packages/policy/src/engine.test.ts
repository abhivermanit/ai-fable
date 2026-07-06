import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './engine.js';
import { defaultPolicyConfig, strictPolicyConfig } from './presets.js';
import type { PolicyConfig, PolicyQuestion, PolicyRule } from './types.js';

function config(rules: PolicyRule[], defaultAllowed = true): PolicyConfig {
  return {
    version: '1.0.0-test',
    rules,
    defaultDecision: { allowed: defaultAllowed, reason: 'default', overridable: true },
  };
}

function rule(overrides: Partial<PolicyRule> & Pick<PolicyRule, 'id' | 'appliesTo' | 'condition' | 'decision'>): PolicyRule {
  return { description: '', priority: 50, enabled: true, ...overrides };
}

describe('PolicyEngine', () => {
  describe('basic evaluation', () => {
    it('returns default decision when no rules match', () => {
      const engine = new PolicyEngine(config([]));
      const decision = engine.evaluate({ type: 'may-execute', context: { taskId: 'test' } });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('default');
      expect(decision.policyVersion).toBe('1.0.0-test');
      expect(decision.evaluatedAt).toBeDefined();
      expect(decision.scope).toBe('global');
    });

    it('returns matching rule decision with traceability', () => {
      const engine = new PolicyEngine(config([
        rule({
          id: 'block-all',
          description: 'Block everything',
          appliesTo: ['may-execute'],
          condition: { always: true },
          decision: { allowed: false, reason: 'blocked', overridable: false },
          scope: 'repository',
        }),
      ]));

      const decision = engine.evaluate({ type: 'may-execute', context: {} });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('blocked');
      expect(decision.rule).toBe('block-all');
      expect(decision.ruleDescription).toBe('Block everything');
      expect(decision.scope).toBe('repository');
      expect(decision.policyVersion).toBe('1.0.0-test');
    });

    it('evaluates rules in priority order (highest first)', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'low', appliesTo: ['may-execute'], condition: { always: true }, decision: { allowed: false, reason: 'low wins', overridable: false }, priority: 10 }),
        rule({ id: 'high', appliesTo: ['may-execute'], condition: { always: true }, decision: { allowed: true, reason: 'high wins', overridable: false }, priority: 90 }),
      ]));

      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.reason).toBe('high wins');
    });

    it('skips disabled rules', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'disabled', appliesTo: ['may-execute'], condition: { always: true }, decision: { allowed: false, reason: 'nope', overridable: false }, enabled: false }),
      ]));

      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(true);
    });

    it('only matches rules for the question type', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'push-only', appliesTo: ['may-push'], condition: { always: true }, decision: { allowed: false, reason: 'no push', overridable: false } }),
      ]));

      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(true);
    });

    it('supports defer — skips rule and continues evaluation', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'deferred', appliesTo: ['may-execute'], condition: { always: true }, decision: { allowed: false, reason: 'deferred', overridable: false, defer: true }, priority: 90, scope: 'repository' }),
        rule({ id: 'actual', appliesTo: ['may-execute'], condition: { always: true }, decision: { allowed: true, reason: 'global allows', overridable: false }, priority: 50, scope: 'global' }),
      ]));

      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('global allows');
      expect(decision.rule).toBe('actual');
      expect(decision.scope).toBe('global');
    });
  });

  describe('condition matching', () => {
    it('matches repository pattern', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'repo', appliesTo: ['may-execute'], condition: { repository: '/path/to/repo' }, decision: { allowed: false, reason: 'repo matched', overridable: false } }),
      ]));

      expect(engine.evaluate({ type: 'may-execute', context: { repository: '/path/to/repo' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-execute', context: { repository: '/other/repo' } }).allowed).toBe(true);
    });

    it('matches branch pattern with wildcard', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'task-branch', appliesTo: ['may-push'], condition: { branch: 'task/*' }, decision: { allowed: true, reason: 'task branch', overridable: false } }),
      ], false));

      expect(engine.evaluate({ type: 'may-push', context: { branch: 'task/abc-123' } }).allowed).toBe(true);
      expect(engine.evaluate({ type: 'may-push', context: { branch: 'main' } }).allowed).toBe(false);
    });

    it('matches file path pattern', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'env', appliesTo: ['may-modify-file'], condition: { filePath: '*.env*' }, decision: { allowed: false, reason: 'env protected', overridable: true } }),
      ]));

      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: '.env' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: '.env.local' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: 'src/app.ts' } }).allowed).toBe(true);
    });

    it('matches command pattern', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'force-push', appliesTo: ['may-run-command'], condition: { command: '*push*--force*' }, decision: { allowed: false, reason: 'blocked', overridable: false } }),
      ]));

      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'git push --force origin main' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'git push origin task/x' } }).allowed).toBe(true);
    });

    it('matches source', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'cli', appliesTo: ['may-execute'], condition: { source: 'cli' }, decision: { allowed: true, reason: 'cli ok', overridable: false } }),
      ], false));

      expect(engine.evaluate({ type: 'may-execute', context: { source: 'cli' } }).allowed).toBe(true);
      expect(engine.evaluate({ type: 'may-execute', context: { source: 'api' } }).allowed).toBe(false);
    });

    it('matches labels', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'high-pri', appliesTo: ['max-retries'], condition: { label: { key: 'priority', value: 'high' } }, decision: { allowed: true, reason: 'more retries', overridable: true, value: 3 }, priority: 60 }),
      ]));

      expect(engine.evaluate({ type: 'max-retries', context: { labels: { priority: 'high' } } }).value).toBe(3);
      expect(engine.evaluate({ type: 'max-retries', context: { labels: { priority: 'normal' } } }).value).toBeUndefined();
    });
  });

  describe('resource questions', () => {
    it('getValue returns resource values', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());

      expect(engine.getValue<number>({ type: 'max-timeout', context: {} })).toBe(300_000);
      expect(engine.getValue<string>({ type: 'select-model', context: {} })).toBe('claude-sonnet');
      expect(engine.getValue<number>({ type: 'max-concurrency', context: {} })).toBe(1);
    });
  });

  describe('default policy config', () => {
    it('blocks .env file modification', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: '.env.production' } }).allowed).toBe(false);
    });

    it('blocks push to main', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'may-push', context: { branch: 'main' } }).allowed).toBe(false);
    });

    it('allows push to task branches', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'may-push', context: { branch: 'task/fix-bug' } }).allowed).toBe(true);
    });

    it('blocks force push command', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'git push --force origin main' } }).allowed).toBe(false);
    });

    it('blocks git reset --hard', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'git reset --hard HEAD~1' } }).allowed).toBe(false);
    });

    it('allows normal commands', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'npm run build' } }).allowed).toBe(true);
    });

    it('requires approval for push to main', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'requires-approval', context: { branch: 'main' } }).allowed).toBe(true);
    });

    it('does not require approval for task branches', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.evaluate({ type: 'requires-approval', context: { branch: 'task/whatever' } }).allowed).toBe(false);
    });
  });

  describe('strict policy config', () => {
    it('denies by default', () => {
      const engine = new PolicyEngine(strictPolicyConfig());
      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(false);
    });

    it('requires approval for everything', () => {
      const engine = new PolicyEngine(strictPolicyConfig());
      expect(engine.evaluate({ type: 'requires-approval', context: { branch: 'task/something' } }).allowed).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('captures an immutable snapshot of the policy', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const snap = engine.snapshot();

      expect(snap.version).toBe('1.0.0-default');
      expect(snap.capturedAt).toBeDefined();
      expect(snap.rules.length).toBeGreaterThan(0);
      expect(snap.defaultDecision).toBeDefined();
    });

    it('snapshot is independent of later mutations', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const snap = engine.snapshot();
      const ruleCountBefore = snap.rules.length;

      engine.addRule(rule({
        id: 'new-rule',
        appliesTo: ['may-execute'],
        condition: { always: true },
        decision: { allowed: false, reason: 'new', overridable: false },
      }));

      expect(snap.rules.length).toBe(ruleCountBefore);
    });
  });

  describe('dynamic rule management', () => {
    it('addRule inserts and respects priority', () => {
      const engine = new PolicyEngine(config([]));

      engine.addRule(rule({
        id: 'dynamic',
        appliesTo: ['may-execute'],
        condition: { always: true },
        decision: { allowed: false, reason: 'dynamic block', overridable: false },
      }));

      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.allowed).toBe(false);
      expect(decision.rule).toBe('dynamic');
    });

    it('removeRule removes by ID', () => {
      const engine = new PolicyEngine(config([
        rule({ id: 'removable', appliesTo: ['may-execute'], condition: { always: true }, decision: { allowed: false, reason: 'blocked', overridable: false } }),
      ]));

      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(false);
      expect(engine.removeRule('removable')).toBe(true);
      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(true);
    });

    it('removeRule returns false for unknown ID', () => {
      const engine = new PolicyEngine(config([]));
      expect(engine.removeRule('nope')).toBe(false);
    });
  });

  describe('isAllowed convenience', () => {
    it('returns boolean', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      expect(engine.isAllowed({ type: 'may-push', context: { branch: 'task/x' } })).toBe(true);
      expect(engine.isAllowed({ type: 'may-push', context: { branch: 'main' } })).toBe(false);
    });
  });
});
