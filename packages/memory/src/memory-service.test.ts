import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryService } from './memory-service.js';
import { InMemoryStore } from './in-memory-store.js';
import type { TaskRecord, ExecutionRecord, VerificationRecord } from './types.js';

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Test task',
    status: 'completed',
    source: 'test',
    createdAt: '2026-07-01T00:00:00.000Z',
    completedAt: '2026-07-01T00:01:00.000Z',
    durationMs: 60_000,
    retryCount: 0,
    labels: {},
    ...overrides,
  };
}

function makeExecution(taskId: string, attempt: number = 0): Omit<ExecutionRecord, 'id'> {
  return {
    taskId,
    attempt,
    steps: [
      { id: 'step-1', description: 'do stuff', agentType: 'stub', status: 'completed', durationMs: 100 },
    ],
    startedAt: '2026-07-01T00:00:00.000Z',
    completedAt: '2026-07-01T00:00:10.000Z',
    durationMs: 10_000,
    success: true,
  };
}

function makeVerification(taskId: string, executionId: string): Omit<VerificationRecord, 'id'> {
  return {
    taskId,
    executionId,
    overallStatus: 'accepted',
    verifierResults: [
      { name: 'build', status: 'pass', message: 'Build passed', durationMs: 5000, artifacts: [] },
      { name: 'tests', status: 'pass', message: 'Tests passed', durationMs: 8000, artifacts: [] },
    ],
    startedAt: '2026-07-01T00:00:10.000Z',
    completedAt: '2026-07-01T00:00:23.000Z',
    durationMs: 13_000,
    failedRequired: [],
    failedAdvisory: [],
  };
}

describe('MemoryService', () => {
  let memory: MemoryService;

  beforeEach(() => {
    memory = new MemoryService(new InMemoryStore());
  });

  describe('task lifecycle', () => {
    it('records and retrieves a task', async () => {
      const task = makeTask({ id: 'task-1' });
      await memory.recordTask(task);

      const loaded = await memory.getTask('task-1');
      expect(loaded).toBeDefined();
      expect(loaded!.description).toBe('Test task');
    });

    it('returns undefined for non-existent task', async () => {
      const loaded = await memory.getTask('nope');
      expect(loaded).toBeUndefined();
    });

    it('queries tasks by status', async () => {
      await memory.recordTask(makeTask({ id: 't1', status: 'completed' }));
      await memory.recordTask(makeTask({ id: 't2', status: 'failed' }));
      await memory.recordTask(makeTask({ id: 't3', status: 'completed' }));

      const completed = await memory.queryTasks({ status: 'completed' });
      expect(completed).toHaveLength(2);
    });

    it('queries tasks by source', async () => {
      await memory.recordTask(makeTask({ id: 't1', source: 'cli' }));
      await memory.recordTask(makeTask({ id: 't2', source: 'ide' }));

      const cli = await memory.queryTasks({ source: 'cli' });
      expect(cli).toHaveLength(1);
      expect(cli[0].id).toBe('t1');
    });

    it('queries tasks by label', async () => {
      await memory.recordTask(makeTask({ id: 't1', labels: { priority: 'high' } }));
      await memory.recordTask(makeTask({ id: 't2', labels: { priority: 'low' } }));

      const high = await memory.queryTasks({ label: { key: 'priority', value: 'high' } });
      expect(high).toHaveLength(1);
      expect(high[0].id).toBe('t1');
    });

    it('queries with limit', async () => {
      for (let i = 0; i < 20; i++) {
        await memory.recordTask(makeTask({ id: `t${i}` }));
      }

      const limited = await memory.queryTasks({ limit: 5 });
      expect(limited).toHaveLength(5);
    });

    it('recentTasks returns latest first', async () => {
      await memory.recordTask(makeTask({ id: 't1', createdAt: '2026-07-01T00:00:00.000Z' }));
      await memory.recordTask(makeTask({ id: 't2', createdAt: '2026-07-02T00:00:00.000Z' }));
      await memory.recordTask(makeTask({ id: 't3', createdAt: '2026-07-03T00:00:00.000Z' }));

      const recent = await memory.recentTasks(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('t3');
      expect(recent[1].id).toBe('t2');
    });

    it('hasAttempted finds matching description', async () => {
      await memory.recordTask(makeTask({ description: 'fix the bug' }));

      const found = await memory.hasAttempted('fix the bug');
      expect(found).toBeDefined();
      expect(found!.description).toBe('fix the bug');
    });

    it('hasAttempted returns undefined for new task', async () => {
      const found = await memory.hasAttempted('never done this');
      expect(found).toBeUndefined();
    });
  });

  describe('execution history', () => {
    it('records and retrieves executions', async () => {
      const id = await memory.recordExecution(makeExecution('task-1', 0));

      expect(id).toBeDefined();
      const history = await memory.getExecutionHistory('task-1');
      expect(history).toHaveLength(1);
      expect(history[0].attempt).toBe(0);
    });

    it('orders by attempt number', async () => {
      await memory.recordExecution(makeExecution('task-1', 1));
      await memory.recordExecution(makeExecution('task-1', 0));
      await memory.recordExecution(makeExecution('task-1', 2));

      const history = await memory.getExecutionHistory('task-1');
      expect(history.map((e) => e.attempt)).toEqual([0, 1, 2]);
    });

    it('getLatestExecution returns last attempt', async () => {
      await memory.recordExecution(makeExecution('task-1', 0));
      await memory.recordExecution(makeExecution('task-1', 1));

      const latest = await memory.getLatestExecution('task-1');
      expect(latest?.attempt).toBe(1);
    });

    it('getLatestExecution returns undefined for unknown task', async () => {
      const latest = await memory.getLatestExecution('nope');
      expect(latest).toBeUndefined();
    });
  });

  describe('verification history', () => {
    it('records and retrieves verifications', async () => {
      const id = await memory.recordVerification(makeVerification('task-1', 'exec-1'));

      expect(id).toBeDefined();
      const history = await memory.getVerificationHistory('task-1');
      expect(history).toHaveLength(1);
      expect(history[0].overallStatus).toBe('accepted');
    });

    it('getLatestVerification returns most recent', async () => {
      await memory.recordVerification({
        ...makeVerification('task-1', 'exec-1'),
        startedAt: '2026-07-01T00:00:00.000Z',
        completedAt: '2026-07-01T00:00:10.000Z',
      });
      await memory.recordVerification({
        ...makeVerification('task-1', 'exec-2'),
        startedAt: '2026-07-01T00:01:00.000Z',
        completedAt: '2026-07-01T00:01:10.000Z',
        overallStatus: 'rejected',
      });

      const latest = await memory.getLatestVerification('task-1');
      expect(latest?.overallStatus).toBe('rejected');
    });
  });

  describe('artifacts', () => {
    it('stores and retrieves text artifacts', async () => {
      const id = await memory.storeArtifact({
        taskId: 'task-1',
        type: 'diff',
        label: 'patch.diff',
        content: '+ added line\n- removed line',
      });

      const artifact = await memory.getArtifact(id);
      expect(artifact).toBeDefined();
      expect(artifact!.type).toBe('diff');
      expect(artifact!.content).toContain('added line');
      expect(artifact!.size).toBeGreaterThan(0);
      expect(artifact!.mimeType).toBe('text/plain');
    });

    it('retrieves all artifacts for a task', async () => {
      await memory.storeArtifact({ taskId: 'task-1', type: 'diff', label: 'a.diff', content: 'diff a' });
      await memory.storeArtifact({ taskId: 'task-1', type: 'log', label: 'build.log', content: 'log data' });
      await memory.storeArtifact({ taskId: 'task-2', type: 'output', label: 'out.txt', content: 'other' });

      const artifacts = await memory.getTaskArtifacts('task-1');
      expect(artifacts).toHaveLength(2);
    });

    it('supports custom MIME type', async () => {
      const id = await memory.storeArtifact({
        taskId: 'task-1',
        type: 'report',
        label: 'report.json',
        content: '{}',
        mimeType: 'application/json',
      });

      const artifact = await memory.getArtifact(id);
      expect(artifact!.mimeType).toBe('application/json');
    });
  });

  describe('task summary', () => {
    it('returns full summary with all related records', async () => {
      const task = makeTask({ id: 'summary-task' });
      await memory.recordTask(task);
      const execId = await memory.recordExecution(makeExecution('summary-task', 0));
      await memory.recordVerification(makeVerification('summary-task', execId));
      await memory.storeArtifact({ taskId: 'summary-task', type: 'diff', label: 'patch', content: 'diff' });

      const summary = await memory.getTaskSummary('summary-task');
      expect(summary).toBeDefined();
      expect(summary!.task.id).toBe('summary-task');
      expect(summary!.executions).toHaveLength(1);
      expect(summary!.verifications).toHaveLength(1);
      expect(summary!.artifacts).toHaveLength(1);
    });

    it('returns undefined for non-existent task', async () => {
      const summary = await memory.getTaskSummary('nope');
      expect(summary).toBeUndefined();
    });
  });

  describe('stats', () => {
    it('returns system-wide statistics', async () => {
      await memory.recordTask(makeTask({ id: 't1', status: 'completed' }));
      await memory.recordTask(makeTask({ id: 't2', status: 'failed' }));
      await memory.recordTask(makeTask({ id: 't3', status: 'cancelled' }));
      await memory.recordExecution(makeExecution('t1'));
      await memory.storeArtifact({ taskId: 't1', type: 'log', label: 'x', content: 'x' });

      const s = await memory.stats();
      expect(s.totalTasks).toBe(3);
      expect(s.completedTasks).toBe(1);
      expect(s.failedTasks).toBe(1);
      expect(s.cancelledTasks).toBe(1);
      expect(s.totalRecords).toBe(5); // 3 tasks + 1 execution + 1 artifact
    });
  });

  describe('clear', () => {
    it('removes all records', async () => {
      await memory.recordTask(makeTask({ id: 't1' }));
      await memory.recordExecution(makeExecution('t1'));
      await memory.storeArtifact({ taskId: 't1', type: 'log', label: 'x', content: 'x' });

      await memory.clear();

      const s = await memory.stats();
      expect(s.totalRecords).toBe(0);
    });
  });
});
