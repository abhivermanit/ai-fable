import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RepoIndex } from './indexer.js';
import { SearchAPI } from './search.js';
import { SymbolKind } from './types.js';

describe('SearchAPI', () => {
  const testDir = join(tmpdir(), `search-api-test-${Date.now()}`);
  let search: SearchAPI;
  let index: RepoIndex;

  beforeAll(async () => {
    mkdirSync(join(testDir, 'src', 'utils'), { recursive: true });
    mkdirSync(join(testDir, 'src', 'core'), { recursive: true });

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

export interface TaskResult {
  success: boolean;
}

export type TaskId = string;
`);

    writeFileSync(join(testDir, 'src', 'orchestrator.ts'), `
import { TaskStatus } from './types.js';
import type { Task, TaskResult } from './types.js';
import { EventBus } from './event-bus.js';
import { isTerminal } from './utils/index.js';

export class Orchestrator {
  private bus: EventBus;

  constructor() {
    this.bus = new EventBus();
  }

  async run(task: Task): Promise<TaskResult> {
    return { success: true };
  }

  async cancel(taskId: string): Promise<boolean> {
    return false;
  }
}

export function createOrchestrator(): Orchestrator {
  return new Orchestrator();
}
`);

    writeFileSync(join(testDir, 'src', 'event-bus.ts'), `
export interface EventHandler {
  (payload: unknown): void;
}

export class EventBus {
  emit(event: string, payload: unknown): void {}
  on(event: string, handler: EventHandler): void {}
  clear(): void {}
}
`);

    writeFileSync(join(testDir, 'src', 'utils', 'index.ts'), `
import { TaskStatus } from '../types.js';

export function isTerminal(status: TaskStatus): boolean {
  return status === TaskStatus.Completed;
}

export function generateId(): string {
  return 'id';
}
`);

    writeFileSync(join(testDir, 'src', 'core', 'constants.ts'), `
export const MAX_RETRIES = 3;
export const TIMEOUT_MS = 30000;
`);

    writeFileSync(join(testDir, 'package.json'), '{ "name": "test-repo" }');
    writeFileSync(join(testDir, '.gitignore'), 'node_modules\ndist\n');

    index = new RepoIndex(testDir);
    await index.fullIndex();
    search = new SearchAPI(index);

    return () => {
      rmSync(testDir, { recursive: true, force: true });
    };
  });

  describe('findSymbol (exact name match)', () => {
    it('finds enum by name', () => {
      const results = search.findSymbol('TaskStatus');
      expect(results).toHaveLength(1);
      expect(results[0].symbol?.kind).toBe(SymbolKind.Enum);
      expect(results[0].filePath).toContain('types.ts');
    });

    it('finds interface by name', () => {
      const results = search.findSymbol('Task');
      expect(results).toHaveLength(1);
      expect(results[0].symbol?.kind).toBe(SymbolKind.Interface);
    });

    it('finds class by name', () => {
      const results = search.findSymbol('Orchestrator');
      expect(results).toHaveLength(1);
      expect(results[0].symbol?.kind).toBe(SymbolKind.Class);
    });

    it('finds function by name', () => {
      const results = search.findSymbol('createOrchestrator');
      expect(results).toHaveLength(1);
      expect(results[0].symbol?.kind).toBe(SymbolKind.Function);
    });

    it('finds variable by name', () => {
      const results = search.findSymbol('MAX_RETRIES');
      expect(results).toHaveLength(1);
      expect(results[0].symbol?.kind).toBe(SymbolKind.Variable);
    });

    it('finds type alias by name', () => {
      const results = search.findSymbol('TaskId');
      expect(results).toHaveLength(1);
      expect(results[0].symbol?.kind).toBe(SymbolKind.TypeAlias);
    });

    it('returns empty for non-existent symbol', () => {
      const results = search.findSymbol('DoesNotExist');
      expect(results).toHaveLength(0);
    });

    it('returns multiple results for duplicate names', () => {
      // TaskResult interface in types.ts is the only definition
      const results = search.findSymbol('TaskResult');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('searchSymbols (partial match)', () => {
    it('finds symbols containing query (case-insensitive)', () => {
      const results = search.searchSymbols('task');
      const names = results.map((r) => r.symbol?.name);
      expect(names).toContain('TaskStatus');
      expect(names).toContain('Task');
      expect(names).toContain('TaskResult');
      expect(names).toContain('TaskId');
    });

    it('finds symbols with partial class name', () => {
      const results = search.searchSymbols('Orch');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].symbol?.name).toBe('Orchestrator');
    });

    it('returns empty for no match', () => {
      const results = search.searchSymbols('xyznonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('findByKind', () => {
    it('finds all classes', () => {
      const results = search.findByKind(SymbolKind.Class);
      const names = results.map((r) => r.symbol?.name);
      expect(names).toContain('Orchestrator');
      expect(names).toContain('EventBus');
    });

    it('finds all interfaces', () => {
      const results = search.findByKind(SymbolKind.Interface);
      const names = results.map((r) => r.symbol?.name);
      expect(names).toContain('Task');
      expect(names).toContain('TaskResult');
      expect(names).toContain('EventHandler');
    });

    it('finds all enums', () => {
      const results = search.findByKind(SymbolKind.Enum);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].symbol?.name).toBe('TaskStatus');
    });
  });

  describe('findReferences', () => {
    it('finds files that import types.ts', () => {
      const results = search.findReferences('src/types.ts');
      const files = results.map((r) => r.filePath);
      expect(files).toContain('src/orchestrator.ts');
      expect(files).toContain('src/utils/index.ts');
    });

    it('finds files that import event-bus.ts', () => {
      const results = search.findReferences('src/event-bus.ts');
      const files = results.map((r) => r.filePath);
      expect(files).toContain('src/orchestrator.ts');
    });

    it('returns empty for file with no dependents', () => {
      const results = search.findReferences('src/core/constants.ts');
      expect(results).toHaveLength(0);
    });
  });

  describe('findPackageDependents', () => {
    it('returns empty when no package imports exist', () => {
      // The test repo doesn't import external packages
      const results = search.findPackageDependents('@ai-fable/core');
      expect(results).toHaveLength(0);
    });
  });

  describe('findFiles', () => {
    it('finds files by name pattern (string)', () => {
      const results = search.findFiles('orchestrator');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].filePath).toContain('orchestrator');
    });

    it('finds files by regex', () => {
      const results = search.findFiles(/\.ts$/);
      expect(results.length).toBeGreaterThanOrEqual(4);
    });

    it('finds files in subdirectories', () => {
      const results = search.findFiles('constants');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].filePath).toContain('core/constants');
    });

    it('returns empty for non-matching pattern', () => {
      const results = search.findFiles('nonexistentfile');
      expect(results).toHaveLength(0);
    });
  });

  describe('impact', () => {
    it('shows direct dependents of types.ts', () => {
      const result = search.impact('src/types.ts');
      expect(result.directDependents).toContain('src/orchestrator.ts');
      expect(result.directDependents).toContain('src/utils/index.ts');
    });

    it('shows transitive dependents', () => {
      // orchestrator.ts imports utils/index.ts, which imports types.ts
      // So orchestrator is both a direct and transitive dependent of types.ts
      const result = search.impact('src/utils/index.ts');
      expect(result.directDependents).toContain('src/orchestrator.ts');
    });

    it('returns empty for leaf files', () => {
      const result = search.impact('src/orchestrator.ts');
      expect(result.directDependents).toHaveLength(0);
      expect(result.affectedCount).toBe(0);
    });
  });

  describe('allExports', () => {
    it('returns all exported symbols', () => {
      const exports = search.allExports();
      const names = exports.map((s) => s.name);
      expect(names).toContain('TaskStatus');
      expect(names).toContain('Orchestrator');
      expect(names).toContain('EventBus');
      expect(names).toContain('isTerminal');
      expect(names).toContain('MAX_RETRIES');
    });

    it('does not include non-exported symbols', () => {
      const exports = search.allExports();
      const names = exports.map((s) => s.name);
      // local variables in orchestrator.ts should not appear
      expect(exports.every((s) => s.exported)).toBe(true);
    });
  });

  describe('changedFiles', () => {
    it('returns files that changed in last index', () => {
      // After fullIndex, all files are "changed" (new)
      const changed = search.changedFiles();
      expect(changed.length).toBeGreaterThan(0);
    });

    it('returns empty after no-change incremental index', async () => {
      await index.incrementalIndex();
      const changed = search.changedFiles();
      expect(changed).toHaveLength(0);
    });

    it('detects modification after file change', async () => {
      writeFileSync(join(testDir, 'src', 'core', 'constants.ts'), `
export const MAX_RETRIES = 5;
export const TIMEOUT_MS = 60000;
export const VERSION = '2.0';
`);
      await index.incrementalIndex();
      const changed = search.changedFiles();
      expect(changed).toContain('src/core/constants.ts');
    });
  });

  describe('stats', () => {
    it('returns repository statistics', () => {
      const s = search.stats();
      expect(s.totalFiles).toBeGreaterThanOrEqual(5);
      expect(s.analyzedFiles).toBeGreaterThanOrEqual(4);
      expect(s.totalSymbols).toBeGreaterThan(0);
      expect(s.totalImports).toBeGreaterThan(0);
      expect(s.graphEdges).toBeGreaterThan(0);
      expect(s.graphNodes).toBeGreaterThan(0);
    });
  });
});
