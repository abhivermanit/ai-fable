import { describe, it, expect } from 'vitest';
import { DependencyGraph, resolveModulePath, buildDependencyGraph } from './dependency-graph.js';
import type { ImportInfo } from './types.js';

describe('resolveModulePath', () => {
  const exists = (paths: string[]) => (p: string) => paths.includes(p);

  it('resolves .js to .ts (ESM convention)', () => {
    const result = resolveModulePath(
      './state-machine.js',
      'src/orchestrator.ts',
      exists(['src/state-machine.ts']),
    );
    expect(result).toBe('src/state-machine.ts');
  });

  it('resolves exact path', () => {
    const result = resolveModulePath(
      './config.json',
      'src/app.ts',
      exists(['src/config.json']),
    );
    expect(result).toBe('src/config.json');
  });

  it('resolves directory index', () => {
    const result = resolveModulePath(
      './utils',
      'src/app.ts',
      exists(['src/utils/index.ts']),
    );
    expect(result).toBe('src/utils/index.ts');
  });

  it('tries extensions when no extension given', () => {
    const result = resolveModulePath(
      './helper',
      'src/app.ts',
      exists(['src/helper.ts']),
    );
    expect(result).toBe('src/helper.ts');
  });

  it('returns undefined for package imports', () => {
    const result = resolveModulePath(
      '@ai-fable/core',
      'src/app.ts',
      () => true,
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined for unresolvable relative import', () => {
    const result = resolveModulePath(
      './nonexistent.js',
      'src/app.ts',
      () => false,
    );
    expect(result).toBeUndefined();
  });

  it('resolves parent directory imports', () => {
    const result = resolveModulePath(
      '../types.js',
      'src/utils/index.ts',
      exists(['src/types.ts']),
    );
    expect(result).toBe('src/types.ts');
  });
});

describe('DependencyGraph', () => {
  it('tracks forward dependencies', () => {
    const graph = new DependencyGraph();
    graph.addEdge({ from: 'a.ts', to: 'b.ts', importedNames: ['foo'] });

    expect(graph.dependenciesOf('a.ts')).toEqual(['b.ts']);
    expect(graph.dependenciesOf('b.ts')).toEqual([]);
  });

  it('tracks reverse dependencies', () => {
    const graph = new DependencyGraph();
    graph.addEdge({ from: 'a.ts', to: 'b.ts', importedNames: ['foo'] });
    graph.addEdge({ from: 'c.ts', to: 'b.ts', importedNames: ['bar'] });

    expect(graph.dependentsOf('b.ts')).toEqual(['a.ts', 'c.ts']);
  });

  it('tracks package dependencies', () => {
    const graph = new DependencyGraph();
    graph.addPackageDependency('a.ts', '@ai-fable/core');
    graph.addPackageDependency('b.ts', '@ai-fable/core');
    graph.addPackageDependency('b.ts', 'vitest');

    expect(graph.dependentsOfPackage('@ai-fable/core')).toEqual(['a.ts', 'b.ts']);
    expect(graph.dependentsOfPackage('vitest')).toEqual(['b.ts']);
  });

  it('computes transitive impact', () => {
    const graph = new DependencyGraph();
    graph.addEdge({ from: 'b.ts', to: 'a.ts', importedNames: [] });
    graph.addEdge({ from: 'c.ts', to: 'b.ts', importedNames: [] });
    graph.addEdge({ from: 'd.ts', to: 'c.ts', importedNames: [] });

    const result = graph.impact('a.ts');
    expect(result.directDependents).toEqual(['b.ts']);
    expect(result.transitiveDependents).toContain('b.ts');
    expect(result.transitiveDependents).toContain('c.ts');
    expect(result.transitiveDependents).toContain('d.ts');
    expect(result.affectedCount).toBe(3);
  });

  it('handles cycles in impact analysis', () => {
    const graph = new DependencyGraph();
    graph.addEdge({ from: 'a.ts', to: 'b.ts', importedNames: [] });
    graph.addEdge({ from: 'b.ts', to: 'a.ts', importedNames: [] });

    const result = graph.impact('a.ts');
    // b depends on a, a depends on b → both affected
    expect(result.transitiveDependents).toContain('b.ts');
  });

  it('removeFile cleans up all edges', () => {
    const graph = new DependencyGraph();
    graph.addEdge({ from: 'a.ts', to: 'b.ts', importedNames: [] });
    graph.addEdge({ from: 'b.ts', to: 'c.ts', importedNames: [] });

    graph.removeFile('b.ts');

    expect(graph.dependenciesOf('a.ts')).toEqual([]);
    expect(graph.dependentsOf('c.ts')).toEqual([]);
    expect(graph.edgeCount).toBe(0);
  });

  it('reports file and edge counts', () => {
    const graph = new DependencyGraph();
    graph.addEdge({ from: 'a.ts', to: 'b.ts', importedNames: [] });
    graph.addEdge({ from: 'a.ts', to: 'c.ts', importedNames: [] });

    expect(graph.edgeCount).toBe(2);
    expect(graph.fileCount).toBe(3);
  });
});

describe('buildDependencyGraph', () => {
  it('builds graph from import map', () => {
    const imports = new Map<string, ImportInfo[]>([
      ['src/app.ts', [
        { sourceFile: 'src/app.ts', moduleSpecifier: './utils.js', isPackageImport: false, importedNames: ['helper'], line: 1 },
        { sourceFile: 'src/app.ts', moduleSpecifier: '@ai-fable/core', isPackageImport: true, importedNames: ['Task'], line: 2 },
      ]],
    ]);

    const fileExists = (p: string) => p === 'src/utils.ts';
    const graph = buildDependencyGraph(imports, fileExists);

    expect(graph.dependenciesOf('src/app.ts')).toEqual(['src/utils.ts']);
    expect(graph.dependentsOfPackage('@ai-fable/core')).toEqual(['src/app.ts']);
  });
});
