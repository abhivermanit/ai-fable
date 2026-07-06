import { describe, it, expect, afterEach } from 'vitest';
import { ProcessManager } from './process-manager.js';

describe('ProcessManager', () => {
  let pm: ProcessManager;

  afterEach(() => {
    if (pm) pm.killAll();
  });

  it('spawns a process and tracks it', () => {
    pm = new ProcessManager();
    const info = pm.spawn('sleep 10');

    expect(info.id).toBeDefined();
    expect(info.pid).toBeGreaterThan(0);
    expect(info.status).toBe('running');
    expect(pm.runningCount).toBe(1);
  });

  it('kills a process', async () => {
    pm = new ProcessManager();
    const info = pm.spawn('sleep 10');

    const killed = pm.kill(info.id);
    expect(killed).toBe(true);

    // Wait briefly for status update
    await new Promise((r) => setTimeout(r, 50));
    const updated = pm.get(info.id);
    expect(updated?.status).toBe('killed');
  });

  it('enforces process limit', () => {
    pm = new ProcessManager(2);
    pm.spawn('sleep 10');
    pm.spawn('sleep 10');

    expect(() => pm.spawn('sleep 10')).toThrow('Process limit reached');
  });

  it('killAll kills all running processes', () => {
    pm = new ProcessManager();
    pm.spawn('sleep 10');
    pm.spawn('sleep 10');
    pm.spawn('sleep 10');

    const killed = pm.killAll();
    expect(killed).toBe(3);
    expect(pm.runningCount).toBe(0);
  });

  it('prune removes non-running processes', async () => {
    pm = new ProcessManager();
    const info = pm.spawn('echo hello');

    // Wait for completion
    await new Promise((r) => setTimeout(r, 100));

    expect(pm.totalCount).toBe(1);
    const pruned = pm.prune();
    expect(pruned).toBe(1);
    expect(pm.totalCount).toBe(0);
  });

  it('list returns all tracked processes', () => {
    pm = new ProcessManager();
    pm.spawn('sleep 10');
    pm.spawn('sleep 10');

    const list = pm.list();
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.status === 'running')).toBe(true);
  });

  it('handles abort signal', async () => {
    pm = new ProcessManager();
    const controller = new AbortController();
    const info = pm.spawn('sleep 10', { signal: controller.signal });

    controller.abort();
    await new Promise((r) => setTimeout(r, 50));

    const updated = pm.get(info.id);
    expect(updated?.status).toBe('killed');
  });

  it('handles timeout', async () => {
    pm = new ProcessManager();
    const info = pm.spawn('sleep 10', { timeoutMs: 50 });

    await new Promise((r) => setTimeout(r, 100));

    const updated = pm.get(info.id);
    expect(updated?.status).toBe('killed');
  });

  it('tracks completion of short-lived processes', async () => {
    pm = new ProcessManager();
    const info = pm.spawn('echo done');

    await new Promise((r) => setTimeout(r, 100));

    const updated = pm.get(info.id);
    expect(updated?.status).toBe('completed');
    expect(updated?.exitCode).toBe(0);
  });

  it('tracks failure of processes', async () => {
    pm = new ProcessManager();
    const info = pm.spawn('exit 1');

    await new Promise((r) => setTimeout(r, 100));

    const updated = pm.get(info.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.exitCode).toBe(1);
  });
});
