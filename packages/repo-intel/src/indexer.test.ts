import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoIndex } from './indexer.js';
import { SearchAPI } from './search.js';

describe('RepoIndex + SearchAPI (integration)', () => {
  const testDir = join(tmpdir(), `repo-intel-integration-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'utils'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'types.ts'), `
export enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
}

export interface Task {
  id: string;
  status: TaskStatus;
}

export type TaskId = string;
`);

    writeFileSync(join(testDir, 'src', 'orchestrator.ts'), `
import { TaskStatus } from './types.js';
import type { Task } from './types.js';
import { EventBus } from './event-bus.js';

export class Orchestrator {
  async run(task: Task) {}
}

export function createOrchestrator() {}
`);

    writeFileSync(join(testDir, 'src', 'event-bus.ts'), `
export class EventBus {
  emit() {}
  on() {}
}
`);

    writeFileSync(join(testDir, 'src', 'utils', 'index.ts'), `
import { TaskStatus } from '../types.js';

export function isTerminal(status: TaskStatus): boolean {
  return false;
}
`);

    writeFileSync(join(testDir, 'package.json'), '{ "name": "test-repo" }');
    writeFileSync(join(testDir, '.gitignore'), 'node_modules\n');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('fullIndex indexes all files and symbols', async () => {
    const index = new RepoIndex(testDir);
    const result = await index.fullIndex();

    expect(result.totalFiles).toBeGreaterThanOrEqual(4);
    expect(result.totalSymbols).toBeGreaterThan(0);
    expect(result.totalImports).toBeGreaterThan(0);
  });

  it('SearchAPI.findSymbol finds TaskStatus', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const results = search.findSymbol('TaskStatus');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toContain('types.ts');
    expect(results[0].symbol?.name).toBe('TaskStatus');
  });

  it('SearchAPI.findSymbol finds Orchestrator', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const results = search.findSymbol('Orchestrator');
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toContain('orchestrator.ts');
  });

  it('SearchAPI.searchSymbols does partial matching', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const results = search.searchSymbols('Task');
    const names = results.map((r) => r.symbol?.name);
    expect(names).toContain('TaskStatus');
    expect(names).toContain('Task');
    expect(names).toContain('TaskId');
  });

  it('SearchAPI.findReferences finds who imports types.ts', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const results = search.findReferences('src/types.ts');
    const files = results.map((r) => r.filePath);
    expect(files).toContain('src/orchestrator.ts');
    expect(files).toContain('src/utils/index.ts');
  });

  it('SearchAPI.findFiles finds test pattern', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const results = search.findFiles('orchestrator');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].filePath).toContain('orchestrator');
  });

  it('SearchAPI.impact shows transitive dependents', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const impact = search.impact('src/types.ts');
    expect(impact.directDependents).toContain('src/orchestrator.ts');
    expect(impact.directDependents).toContain('src/utils/index.ts');
    expect(impact.affectedCount).toBeGreaterThanOrEqual(2);
  });

  it('SearchAPI.stats returns summary', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();
    const search = new SearchAPI(index);

    const stats = search.stats();
    expect(stats.totalFiles).toBeGreaterThanOrEqual(4);
    expect(stats.totalSymbols).toBeGreaterThan(0);
    expect(stats.graphEdges).toBeGreaterThan(0);
  });

  it('incrementalIndex detects no changes on second run', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();

    const result = await index.incrementalIndex();
    expect(result.changedFiles).toBe(0);
  });

  it('incrementalIndex detects file modification', async () => {
    const index = new RepoIndex(testDir);
    await index.fullIndex();

    // Modify a file
    writeFileSync(join(testDir, 'src', 'types.ts'), `
export enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
}

export interface Task {
  id: string;
  status: TaskStatus;
}

export type TaskId = string;
`);

    const result = await index.incrementalIndex();
    expect(result.changedFiles).toBeGreaterThanOrEqual(1);
  });
});
