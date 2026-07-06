import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './engine.js';
import { defaultPolicyConfig, strictPolicyConfig } from './presets.js';
import type { PolicyConfig, PolicyQuestion, PolicyRule } from './types.js';

describe('PolicyEngine', () => {
  describe('basic evaluation', () => {
    it('returns default decision when no rules match', () => {
      const engine = new PolicyEngine({
        rules: [],
        defaultDecision: { allowed: true, reason: 'default allow', overridable: true },
      });

      const decision = engine.evaluate({
        type: 'may-execute',
        context: { taskId: 'test' },
      });

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('default allow');
    });

    it('returns matching rule decision', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'block-all',
          description: 'Block everything',
          appliesTo: ['may-execute'],
          condition: { always: true },
          decision: { allowed: false, reason: 'blocked', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      const decision = engine.evaluate({
        type: 'may-execute',
        context: {},
      });

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('blocked');
      expect(decision.rule).toBe('block-all');
    });

    it('evaluates rules in priority order (highest first)', () => {
      const engine = new PolicyEngine({
        rules: [
          {
            id: 'low-priority',
            description: 'Low',
            appliesTo: ['may-execute'],
            condition: { always: true },
            decision: { allowed: false, reason: 'low wins', overridable: false },
            priority: 10,
            enabled: true,
          },
          {
            id: 'high-priority',
            description: 'High',
            appliesTo: ['may-execute'],
            condition: { always: true },
            decision: { allowed: true, reason: 'high wins', overridable: false },
            priority: 90,
            enabled: true,
          },
        ],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.reason).toBe('high wins');
    });

    it('skips disabled rules', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'disabled',
          description: 'Disabled rule',
          appliesTo: ['may-execute'],
          condition: { always: true },
          decision: { allowed: false, reason: 'should not match', overridable: false },
          priority: 100,
          enabled: false,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.allowed).toBe(true);
    });

    it('only matches rules for the question type', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'push-rule',
          description: 'Only for push',
          appliesTo: ['may-push'],
          condition: { always: true },
          decision: { allowed: false, reason: 'no push', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      // Different question type — rule should not match
      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.allowed).toBe(true);
    });
  });

  describe('condition matching', () => {
    it('matches repository pattern', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'repo-rule',
          description: 'Match specific repo',
          appliesTo: ['may-execute'],
          condition: { repository: '/path/to/repo' },
          decision: { allowed: false, reason: 'repo matched', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      expect(engine.evaluate({ type: 'may-execute', context: { repository: '/path/to/repo' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-execute', context: { repository: '/other/repo' } }).allowed).toBe(true);
    });

    it('matches branch pattern with wildcard', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'task-branch',
          description: 'Match task branches',
          appliesTo: ['may-push'],
          condition: { branch: 'task/*' },
          decision: { allowed: true, reason: 'task branch', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: false, reason: 'default deny', overridable: true },
      });

      expect(engine.evaluate({ type: 'may-push', context: { branch: 'task/abc-123' } }).allowed).toBe(true);
      expect(engine.evaluate({ type: 'may-push', context: { branch: 'main' } }).allowed).toBe(false);
    });

    it('matches file path pattern', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'env-protection',
          description: 'Protect env files',
          appliesTo: ['may-modify-file'],
          condition: { filePath: '*.env*' },
          decision: { allowed: false, reason: 'env protected', overridable: true },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: '.env' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: '.env.local' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-modify-file', context: { filePath: 'src/app.ts' } }).allowed).toBe(true);
    });

    it('matches command pattern', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'block-force-push',
          description: 'Block force push',
          appliesTo: ['may-run-command'],
          condition: { command: '*push*--force*' },
          decision: { allowed: false, reason: 'force push blocked', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'git push --force origin main' } }).allowed).toBe(false);
      expect(engine.evaluate({ type: 'may-run-command', context: { command: 'git push origin task/x' } }).allowed).toBe(true);
    });

    it('matches source', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'cli-only',
          description: 'Only CLI source',
          appliesTo: ['may-execute'],
          condition: { source: 'cli' },
          decision: { allowed: true, reason: 'cli allowed', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: false, reason: 'default deny', overridable: true },
      });

      expect(engine.evaluate({ type: 'may-execute', context: { source: 'cli' } }).allowed).toBe(true);
      expect(engine.evaluate({ type: 'may-execute', context: { source: 'api' } }).allowed).toBe(false);
    });

    it('matches labels', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'high-priority',
          description: 'High priority tasks',
          appliesTo: ['max-retries'],
          condition: { label: { key: 'priority', value: 'high' } },
          decision: { allowed: true, reason: 'high priority gets more retries', overridable: true, value: 3 },
          priority: 60,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true, value: 1 },
      });

      const high = engine.evaluate({ type: 'max-retries', context: { labels: { priority: 'high' } } });
      expect(high.value).toBe(3);

      const normal = engine.evaluate({ type: 'max-retries', context: { labels: { priority: 'normal' } } });
      expect(normal.value).toBe(1);
    });
  });

  describe('resource questions', () => {
    it('getValue returns resource values', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());

      const timeout = engine.getValue<number>({ type: 'max-timeout', context: {} });
      expect(timeout).toBe(300_000);

      const model = engine.getValue<string>({ type: 'select-model', context: {} });
      expect(model).toBe('claude-sonnet');

      const concurrency = engine.getValue<number>({ type: 'max-concurrency', context: {} });
      expect(concurrency).toBe(1);
    });
  });

  describe('default policy config', () => {
    it('blocks .env file modification', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-modify-file',
        context: { filePath: '.env.production' },
      });
      expect(decision.allowed).toBe(false);
    });

    it('blocks push to main', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-push',
        context: { branch: 'main' },
      });
      expect(decision.allowed).toBe(false);
    });

    it('allows push to task branches', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-push',
        context: { branch: 'task/fix-bug' },
      });
      expect(decision.allowed).toBe(true);
    });

    it('blocks force push command', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-run-command',
        context: { command: 'git push --force origin main' },
      });
      expect(decision.allowed).toBe(false);
    });

    it('blocks git reset --hard', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-run-command',
        context: { command: 'git reset --hard HEAD~1' },
      });
      expect(decision.allowed).toBe(false);
    });

    it('allows normal commands', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-run-command',
        context: { command: 'npm run build' },
      });
      expect(decision.allowed).toBe(true);
    });

    it('requires approval for push to main', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'requires-approval',
        context: { branch: 'main' },
      });
      expect(decision.allowed).toBe(true); // yes, approval IS required
    });

    it('does not require approval for task branches', () => {
      const engine = new PolicyEngine(defaultPolicyConfig());
      const decision = engine.evaluate({
        type: 'requires-approval',
        context: { branch: 'task/whatever' },
      });
      expect(decision.allowed).toBe(false); // no, approval NOT required
    });
  });

  describe('strict policy config', () => {
    it('denies by default', () => {
      const engine = new PolicyEngine(strictPolicyConfig());
      const decision = engine.evaluate({
        type: 'may-execute',
        context: {},
      });
      expect(decision.allowed).toBe(false);
    });

    it('requires approval for everything', () => {
      const engine = new PolicyEngine(strictPolicyConfig());
      const decision = engine.evaluate({
        type: 'requires-approval',
        context: { branch: 'task/something' },
      });
      // Strict mode: the catch-all approval rule matches
      expect(decision.allowed).toBe(true);
    });
  });

  describe('dynamic rule management', () => {
    it('addRule inserts and respects priority', () => {
      const engine = new PolicyEngine({
        rules: [],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      engine.addRule({
        id: 'dynamic-block',
        description: 'Dynamically added',
        appliesTo: ['may-execute'],
        condition: { always: true },
        decision: { allowed: false, reason: 'dynamic block', overridable: false },
        priority: 50,
        enabled: true,
      });

      const decision = engine.evaluate({ type: 'may-execute', context: {} });
      expect(decision.allowed).toBe(false);
      expect(decision.rule).toBe('dynamic-block');
    });

    it('removeRule removes by ID', () => {
      const engine = new PolicyEngine({
        rules: [{
          id: 'removable',
          description: 'Will be removed',
          appliesTo: ['may-execute'],
          condition: { always: true },
          decision: { allowed: false, reason: 'blocked', overridable: false },
          priority: 50,
          enabled: true,
        }],
        defaultDecision: { allowed: true, reason: 'default', overridable: true },
      });

      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(false);

      const removed = engine.removeRule('removable');
      expect(removed).toBe(true);

      expect(engine.evaluate({ type: 'may-execute', context: {} }).allowed).toBe(true);
    });

    it('removeRule returns false for unknown ID', () => {
      const engine = new PolicyEngine({ rules: [], defaultDecision: { allowed: true, reason: 'x', overridable: true } });
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
