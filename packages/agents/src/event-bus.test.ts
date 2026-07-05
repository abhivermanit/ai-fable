import { describe, it, expect, vi } from 'vitest';
import { TaskStatus, TaskPriority } from '@ai-fable/core';
import type { Task } from '@ai-fable/core';
import { EventBus } from './event-bus.js';

function makeTask(): Task {
  const now = new Date().toISOString();
  return {
    id: 'test-task',
    status: TaskStatus.Pending,
    priority: TaskPriority.Normal,
    description: 'test',
    steps: [],
    metadata: { source: 'test', retryCount: 0, maxRetries: 1, labels: {} },
    createdAt: now,
    updatedAt: now,
  };
}

describe('EventBus', () => {
  it('calls registered handler on emit', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('task:created', handler);
    const task = makeTask();
    bus.emit('task:created', { task });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ task });
  });

  it('supports multiple handlers for the same event', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('task:created', h1);
    bus.on('task:created', h2);

    bus.emit('task:created', { task: makeTask() });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('unsubscribe removes handler', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.on('task:created', handler);
    unsub();

    bus.emit('task:created', { task: makeTask() });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call handlers for other events', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('task:completed', handler);
    bus.emit('task:created', { task: makeTask() });

    expect(handler).not.toHaveBeenCalled();
  });

  it('logs sync errors but does not throw or block other handlers', () => {
    const bus = new EventBus();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badHandler = vi.fn(() => {
      throw new Error('boom');
    });
    const goodHandler = vi.fn();

    bus.on('task:created', badHandler);
    bus.on('task:created', goodHandler);

    // Should not throw
    bus.emit('task:created', { task: makeTask() });

    expect(badHandler).toHaveBeenCalledOnce();
    expect(goodHandler).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(consoleSpy.mock.calls[0][0]).toContain('[EventBus]');

    consoleSpy.mockRestore();
  });

  it('clear() removes all handlers', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('task:created', handler);
    bus.on('task:completed', handler);
    bus.clear();

    bus.emit('task:created', { task: makeTask() });
    bus.emit('task:completed', { task: makeTask() });

    expect(handler).not.toHaveBeenCalled();
  });

  it('clear(event) removes only handlers for that event', () => {
    const bus = new EventBus();
    const createHandler = vi.fn();
    const completeHandler = vi.fn();

    bus.on('task:created', createHandler);
    bus.on('task:completed', completeHandler);
    bus.clear('task:created');

    bus.emit('task:created', { task: makeTask() });
    bus.emit('task:completed', { task: makeTask() });

    expect(createHandler).not.toHaveBeenCalled();
    expect(completeHandler).toHaveBeenCalledOnce();
  });

  it('emits status-changed with from and to', () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on('task:status-changed', handler);
    const task = makeTask();
    bus.emit('task:status-changed', {
      task,
      from: TaskStatus.Pending,
      to: TaskStatus.Planning,
    });

    expect(handler).toHaveBeenCalledWith({
      task,
      from: TaskStatus.Pending,
      to: TaskStatus.Planning,
    });
  });
});
