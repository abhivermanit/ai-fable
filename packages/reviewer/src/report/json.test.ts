import { describe, it, expect } from 'vitest';
import { generateJson } from './json.js';
import type { DiffFile } from '@ai-fable/core';

function makeFile(path: string, opts: Partial<DiffFile> & { adds?: number; dels?: number } = {}): DiffFile {
  const { adds = 0, dels = 0, ...rest } = opts;
  const lines = [
    ...Array.from({ length: adds }, (_, i) => `+added ${i}`),
    ...Array.from({ length: dels }, (_, i) => `-deleted ${i}`),
  ];
  return {
    filePath: path,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    isBinary: false,
    hunks: lines.length > 0 ? [{ oldStart: 1, oldLines: dels, newStart: 1, newLines: adds, lines }] : [],
    ...rest,
  };
}

describe('generateJson', () => {
  it('returns correct structure', () => {
    const result = generateJson('/repo', 'main', [makeFile('a.ts', { adds: 5, dels: 2 })], ['img.png'], '2026-01-01T00:00:00Z');

    expect(result.timestamp).toBe('2026-01-01T00:00:00Z');
    expect(result.repository).toBe('/repo');
    expect(result.branch).toBe('main');
    expect(result.files).toHaveLength(1);
    expect(result.skipped).toEqual(['img.png']);
    expect(result.stats).toEqual({ files: 1, insertions: 5, deletions: 2 });
  });

  it('reports file status correctly', () => {
    const files = [
      makeFile('new.ts', { isNew: true, adds: 3 }),
      makeFile('del.ts', { isDeleted: true, dels: 2 }),
      makeFile('renamed.ts', { isRenamed: true, adds: 1, dels: 1 }),
      makeFile('mod.ts', { adds: 4, dels: 1 }),
    ];
    const result = generateJson('/repo', 'dev', files, [], '2026-01-01T00:00:00Z');

    expect(result.files[0]!.status).toBe('added');
    expect(result.files[1]!.status).toBe('deleted');
    expect(result.files[2]!.status).toBe('renamed');
    expect(result.files[3]!.status).toBe('modified');
  });

  it('counts per-file insertions and deletions', () => {
    const files = [makeFile('a.ts', { adds: 10, dels: 3 })];
    const result = generateJson('/repo', 'main', files, [], '2026-01-01T00:00:00Z');

    expect(result.files[0]!.insertions).toBe(10);
    expect(result.files[0]!.deletions).toBe(3);
  });

  it('handles empty file list', () => {
    const result = generateJson('/repo', 'main', [], ['all-skipped.png'], '2026-01-01T00:00:00Z');
    expect(result.files).toEqual([]);
    expect(result.stats).toEqual({ files: 0, insertions: 0, deletions: 0 });
  });
});
