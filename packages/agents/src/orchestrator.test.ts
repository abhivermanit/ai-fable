import { describe, it, expect, vi } from 'vitest';
import { TaskStatus, TaskPriority, TaskStepStatus } from '@ai-fable/core';
import type { Task, TaskStep } from '@ai-fable/core';
import { Orchestrator } from './orchestrator.js';
import type { OrchestratorConfig } from './orchestrator.js';
import {
  StubPlanner,
  StubWorker,
  StubVerifier,
  InMemoryTaskStore,
} from './stubs.js';
import type { Planner, Verifier, Worker, WorkerContext } from './interfaces.js';

function createOrchestrator(overrides: Partial<OrchestratorConfig> = {}): Orchestrator {
  const config: OrchestratorConfig = {
    planner: new StubPlanner(),
    workers: new Map([['stub', new StubWorker()]]),
    verifier: new StubVerifier(),
    store: new InMemoryTaskStore(),
    ...overrides,
  };
  return new Orchestrator(config);
}

describe('Orchestrator', () => {
  describe('create', () => {
    it('creates a task in pending status', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'test task' });

      expect(task.id).toBeDefined();
      expect(task.status).toBe(TaskStatus.Pending);
      expect(task.description).toBe('test task');
      expect(task.priority).toBe(TaskPriority.Normal);
      expect(task.steps).toEqual([]);
      expect(task.metadata.retryCount).toBe(0);
    });

    it('generates UUID-format task IDs', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'uuid test' });

      // UUID v4 format: 8-4-4-4-12 hex chars
      expect(task.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('assigns custom priority', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({
        description: 'urgent',
        priority: TaskPriority.Critical,
      });

      expect(task.priority).toBe(TaskPriority.Critical);
    });

    it('emits task:created event', async () => {
      const orch = createOrchestrator();
      const handler = vi.fn();
      orch.events.on('task:created', handler);

      await orch.create({ description: 'test' });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].task.description).toBe('test');
    });

    it('adds task to the queue', async () => {
      const orch = createOrchestrator();
      await orch.create({ description: 'queued' });

      expect(orch.queue.size).toBe(1);
    });

    it('persists the task to the store', async () => {
      const store = new InMemoryTaskStore();
      const orch = createOrchestrator({ store });
      const task = await orch.create({ description: 'persisted' });

      const loaded = await store.load(task.id);
      expect(loaded).toBeDefined();
      expect(loaded!.description).toBe('persisted');
    });
  });

  describe('run (happy path)', () => {
    it('transitions through full lifecycle: pending → planning → planned → running → verifying → completed', async () => {
      const orch = createOrchestrator();
      const statuses: TaskStatus[] = [];

      orch.events.on('task:status-changed', ({ to }) => {
        statuses.push(to);
      });

      const task = await orch.create({ description: 'full lifecycle' });
      const result = await orch.run(task);

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(statuses).toEqual([
        TaskStatus.Planning,
        TaskStatus.Planned,
        TaskStatus.Running,
        TaskStatus.Verifying,
        TaskStatus.Completed,
      ]);
    });

    it('populates steps after planning', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'plan me' });
      await orch.run(task);

      const loaded = await orch.get(task.id);
      expect(loaded!.steps.length).toBeGreaterThan(0);
      expect(loaded!.steps[0].status).toBe(TaskStepStatus.Completed);
    });

    it('sets completedAt timestamp', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'timed' });
      await orch.run(task);

      const loaded = await orch.get(task.id);
      expect(loaded!.completedAt).toBeDefined();
    });

    it('emits task:completed event', async () => {
      const orch = createOrchestrator();
      const handler = vi.fn();
      orch.events.on('task:completed', handler);

      const task = await orch.create({ description: 'done' });
      await orch.run(task);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('run (verification failure with retry)', () => {
    it('retries once then succeeds if verification passes on retry', async () => {
      let callCount = 0;
      const verifier: Verifier = {
        async verify() {
          callCount++;
          if (callCount === 1) {
            return { passed: false, confidence: 0.3, issues: [{ severity: 'error', message: 'bad' }] };
          }
          return { passed: true, confidence: 0.9, issues: [] };
        },
      };

      const orch = createOrchestrator({ verifier, maxRetries: 1 });
      const task = await orch.create({ description: 'retry me' });
      const result = await orch.run(task);

      expect(result.success).toBe(true);
      expect(callCount).toBe(2);
    });

    it('fails after retries exhausted', async () => {
      const verifier: Verifier = {
        async verify() {
          return { passed: false, confidence: 0.2, issues: [{ severity: 'error', message: 'always fails' }] };
        },
      };

      const orch = createOrchestrator({ verifier, maxRetries: 1 });
      const handler = vi.fn();
      orch.events.on('task:failed', handler);

      const task = await orch.create({ description: 'will fail' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VERIFICATION_FAILED');
      expect(handler).toHaveBeenCalledOnce();

      const loaded = await orch.get(task.id);
      expect(loaded!.status).toBe(TaskStatus.Failed);
    });

    it('retry failure path uses the LAST verification result', async () => {
      let callCount = 0;
      const verifier: Verifier = {
        async verify() {
          callCount++;
          // Each call returns a different confidence so we can verify which is used
          return {
            passed: false,
            confidence: callCount * 0.1, // 0.1, 0.2, 0.3
            issues: [{ severity: 'error', message: `fail #${callCount}` }],
          };
        },
      };

      const orch = createOrchestrator({ verifier, maxRetries: 2 });
      const task = await orch.create({ description: 'retry failure path' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      // Should be 0.3 (third call), not 0.1 (first call)
      expect(result.confidence).toBeCloseTo(0.3);
      expect(result.error?.message).toContain('2 retries');
      expect(callCount).toBe(3); // initial + 2 retries
    });

    it('supports maxRetries > 1', async () => {
      let callCount = 0;
      const verifier: Verifier = {
        async verify() {
          callCount++;
          if (callCount <= 3) {
            return { passed: false, confidence: 0.1 * callCount, issues: [{ severity: 'error', message: 'not yet' }] };
          }
          return { passed: true, confidence: 0.95, issues: [] };
        },
      };

      const orch = createOrchestrator({ verifier, maxRetries: 3 });
      const task = await orch.create({ description: 'retry 3 times' });
      const result = await orch.run(task);

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(callCount).toBe(4); // initial + 3 retries
    });

    it('maxRetries=0 means no retries', async () => {
      let callCount = 0;
      const verifier: Verifier = {
        async verify() {
          callCount++;
          return { passed: false, confidence: 0.1, issues: [{ severity: 'error', message: 'nope' }] };
        },
      };

      const orch = createOrchestrator({ verifier, maxRetries: 0 });
      const task = await orch.create({ description: 'no retries' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      expect(callCount).toBe(1);
    });
  });

  describe('run (execution failure)', () => {
    it('fails if worker throws', async () => {
      const failWorker: Worker = {
        agentType: 'stub',
        async execute() {
          throw new Error('worker exploded');
        },
      };

      const orch = createOrchestrator({
        workers: new Map([['stub', failWorker]]),
      });

      const task = await orch.create({ description: 'will explode' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('worker exploded');
    });

    it('fails if no worker for agent type', async () => {
      const planner: Planner = {
        async plan(task: Task): Promise<TaskStep[]> {
          return [{
            id: 'step-1',
            description: 'do thing',
            status: TaskStepStatus.Pending,
            agentType: 'nonexistent',
            input: {},
          }];
        },
      };

      const orch = createOrchestrator({ planner });
      const task = await orch.create({ description: 'no worker' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No worker registered');
    });

    it('fails if planner throws', async () => {
      const planner: Planner = {
        async plan() {
          throw new Error('planner crashed');
        },
      };

      const orch = createOrchestrator({ planner });
      const task = await orch.create({ description: 'planner will throw' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('planner crashed');

      const loaded = await orch.get(task.id);
      expect(loaded!.status).toBe(TaskStatus.Failed);
    });

    it('fails if verifier throws', async () => {
      const verifier: Verifier = {
        async verify() {
          throw new Error('verifier crashed');
        },
      };

      const orch = createOrchestrator({ verifier });
      const task = await orch.create({ description: 'verifier will throw' });
      const result = await orch.run(task);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('verifier crashed');

      const loaded = await orch.get(task.id);
      expect(loaded!.status).toBe(TaskStatus.Failed);
    });

    it('handles empty plan (no steps)', async () => {
      const planner: Planner = {
        async plan(): Promise<TaskStep[]> {
          return [];
        },
      };

      const orch = createOrchestrator({ planner });
      const task = await orch.create({ description: 'empty plan' });
      const result = await orch.run(task);

      // Empty plan still goes through verify — stub verifier passes
      expect(result.success).toBe(true);
      expect(result.steps).toEqual([]);
    });

    it('handles worker timeout via AbortSignal', async () => {
      const slowWorker: Worker = {
        agentType: 'stub',
        async execute(_step: TaskStep, context: WorkerContext) {
          // Simulate a slow worker that respects abort
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve({ done: true }), 10000);
            context.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            });
          });
        },
      };

      const orch = createOrchestrator({
        workers: new Map([['stub', slowWorker]]),
      });

      const task = await orch.create({ description: 'timeout test' });

      // Use an external signal that we abort quickly
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);

      const result = await orch.run(task, controller.signal);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
    });
  });

  describe('runNext', () => {
    it('returns undefined when queue is empty', async () => {
      const orch = createOrchestrator();
      const result = await orch.runNext();
      expect(result).toBeUndefined();
    });

    it('runs the next task from the queue', async () => {
      const orch = createOrchestrator();
      await orch.create({ description: 'queued task' });

      const result = await orch.runNext();
      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(orch.queue.isEmpty).toBe(true);
    });

    it('respects priority ordering', async () => {
      const results: string[] = [];

      const planner: Planner = {
        async plan(task: Task): Promise<TaskStep[]> {
          results.push(task.description);
          return [{
            id: `${task.id}-step`,
            description: task.description,
            status: TaskStepStatus.Pending,
            agentType: 'stub',
            input: {},
          }];
        },
      };

      const orch = createOrchestrator({ planner });
      await orch.create({ description: 'low', priority: TaskPriority.Low });
      await orch.create({ description: 'high', priority: TaskPriority.High });

      await orch.runNext();
      await orch.runNext();

      expect(results[0]).toBe('high');
      expect(results[1]).toBe('low');
    });
  });

  describe('cancel', () => {
    it('cancels a pending task', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'cancel me' });

      const cancelled = await orch.cancel(task.id);
      expect(cancelled).toBe(true);

      const loaded = await orch.get(task.id);
      expect(loaded!.status).toBe(TaskStatus.Cancelled);
    });

    it('emits task:cancelled event', async () => {
      const orch = createOrchestrator();
      const handler = vi.fn();
      orch.events.on('task:cancelled', handler);

      const task = await orch.create({ description: 'cancel me' });
      await orch.cancel(task.id);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns false for non-existent task', async () => {
      const orch = createOrchestrator();
      const result = await orch.cancel('does-not-exist');
      expect(result).toBe(false);
    });

    it('returns false for already-completed task', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'complete first' });
      await orch.run(task);

      const result = await orch.cancel(task.id);
      expect(result).toBe(false);
    });

    it('removes task from queue', async () => {
      const orch = createOrchestrator();
      const task = await orch.create({ description: 'remove from queue' });
      expect(orch.queue.size).toBe(1);

      await orch.cancel(task.id);
      expect(orch.queue.size).toBe(0);
    });

    it('cancels a running task by signalling its AbortController', async () => {
      let stepStarted = false;
      let stepAborted = false;

      const slowWorker: Worker = {
        agentType: 'stub',
        async execute(_step: TaskStep, context: WorkerContext) {
          stepStarted = true;
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve({ done: true }), 10000);
            context.signal.addEventListener('abort', () => {
              stepAborted = true;
              clearTimeout(timer);
              reject(new Error('aborted'));
            });
          });
        },
      };

      const store = new InMemoryTaskStore();
      const orch = createOrchestrator({
        workers: new Map([['stub', slowWorker]]),
        store,
      });

      const task = await orch.create({ description: 'cancel while running' });

      // Start running in the background
      const runPromise = orch.run(task);

      // Wait for the worker to start
      await vi.waitFor(() => {
        expect(stepStarted).toBe(true);
      });

      // Cancel while running
      const cancelled = await orch.cancel(task.id);
      expect(cancelled).toBe(true);

      // Wait for run to complete
      const result = await runPromise;

      expect(stepAborted).toBe(true);
      expect(result.success).toBe(false);

      // Final state must be Cancelled
      const loaded = await store.load(task.id);
      expect(loaded!.status).toBe(TaskStatus.Cancelled);
    });
  });

  describe('step events', () => {
    it('emits step-started and step-completed for each step', async () => {
      const orch = createOrchestrator();
      const started = vi.fn();
      const completed = vi.fn();

      orch.events.on('task:step-started', started);
      orch.events.on('task:step-completed', completed);

      const task = await orch.create({ description: 'with events' });
      await orch.run(task);

      expect(started).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledOnce();
    });

    it('emits step-failed on worker error', async () => {
      const failWorker: Worker = {
        agentType: 'stub',
        async execute() {
          throw new Error('step failed');
        },
      };

      const orch = createOrchestrator({
        workers: new Map([['stub', failWorker]]),
      });

      const handler = vi.fn();
      orch.events.on('task:step-failed', handler);

      const task = await orch.create({ description: 'fail step' });
      await orch.run(task);

      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
