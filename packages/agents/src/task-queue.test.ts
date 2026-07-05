import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStatus, TaskPriority } from '@ai-fable/core';
import type { Task } from '@ai-fable/core';
import { TaskQueue } from './task-queue.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: `task-${Math.random().toString(36).slice(2)}`,
    status: TaskStatus.Pending,
    priority: TaskPriority.Normal,
    description: 'test task',
    steps: [],
    metadata: {
      source: 'test',
      retryCount: 0,
      maxRetries: 1,
      labels: {},
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  it('starts empty', () => {
    expect(queue.isEmpty).toBe(true);
    expect(queue.size).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });

  it('enqueues and dequeues a single task', () => {
    const task = makeTask();
    queue.enqueue(task);
    expect(queue.size).toBe(1);
    expect(queue.isEmpty).toBe(false);

    const dequeued = queue.dequeue();
    expect(dequeued?.id).toBe(task.id);
    expect(queue.isEmpty).toBe(true);
  });

  it('dequeues in FIFO order within same priority', () => {
    const task1 = makeTask({ id: 'first' });
    const task2 = makeTask({ id: 'second' });
    const task3 = makeTask({ id: 'third' });

    queue.enqueue(task1);
    queue.enqueue(task2);
    queue.enqueue(task3);

    expect(queue.dequeue()?.id).toBe('first');
    expect(queue.dequeue()?.id).toBe('second');
    expect(queue.dequeue()?.id).toBe('third');
  });

  it('dequeues higher priority first', () => {
    const low = makeTask({ id: 'low', priority: TaskPriority.Low });
    const high = makeTask({ id: 'high', priority: TaskPriority.High });
    const normal = makeTask({ id: 'normal', priority: TaskPriority.Normal });
    const critical = makeTask({ id: 'critical', priority: TaskPriority.Critical });

    // Enqueue in arbitrary order
    queue.enqueue(low);
    queue.enqueue(normal);
    queue.enqueue(critical);
    queue.enqueue(high);

    expect(queue.dequeue()?.id).toBe('critical');
    expect(queue.dequeue()?.id).toBe('high');
    expect(queue.dequeue()?.id).toBe('normal');
    expect(queue.dequeue()?.id).toBe('low');
  });

  it('peek returns next without removing', () => {
    const task = makeTask();
    queue.enqueue(task);

    expect(queue.peek()?.id).toBe(task.id);
    expect(queue.size).toBe(1); // still there
  });

  it('peek returns undefined on empty queue', () => {
    expect(queue.peek()).toBeUndefined();
  });

  it('remove removes a task by ID', () => {
    const task1 = makeTask({ id: 'keep' });
    const task2 = makeTask({ id: 'remove-me' });
    const task3 = makeTask({ id: 'also-keep' });

    queue.enqueue(task1);
    queue.enqueue(task2);
    queue.enqueue(task3);

    const removed = queue.remove('remove-me');
    expect(removed).toBe(true);
    expect(queue.size).toBe(2);

    expect(queue.dequeue()?.id).toBe('keep');
    expect(queue.dequeue()?.id).toBe('also-keep');
  });

  it('remove returns false for non-existent task', () => {
    expect(queue.remove('does-not-exist')).toBe(false);
  });

  it('all() returns tasks in priority order', () => {
    const high = makeTask({ id: 'high', priority: TaskPriority.High });
    const low = makeTask({ id: 'low', priority: TaskPriority.Low });

    queue.enqueue(low);
    queue.enqueue(high);

    const all = queue.all();
    expect(all[0].id).toBe('high');
    expect(all[1].id).toBe('low');
  });
});
