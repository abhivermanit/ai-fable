import { describe, it, expect } from 'vitest';
import { generateMarkdown, computeStats } from './markdown.js';
import type { DiffFile } from '@ai-fable/core';

function makeFile(path: string, opts: Partial<DiffFile> & { adds?: number; dels?: number } = {}): DiffFile {
  const { adds = 0, dels = 0, ...rest } = opts;
  const lines = [
    ...Array.from({ length: adds }, (_, i) => `+added line ${i}`),
    ...Array.from({ length: dels }, (_, i) => `-deleted line ${i}`),
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

describe('computeStats', () => {
  it('counts insertions and deletions', () => {
    const files = [makeFile('a.ts', { adds: 10, dels: 3 }), makeFile('b.ts', { adds: 5, dels: 2 })];
    const stats = computeStats(files);
    expect(stats.files).toBe(2);
    expect(stats.insertions).toBe(15);
    expect(stats.deletions).toBe(5);
  });

  it('returns zeros for empty file list', () => {
    const stats = computeStats([]);
    expect(stats).toEqual({ files: 0, insertions: 0, deletions: 0 });
  });
});

describe('generateMarkdown', () => {
  it('includes repository and branch', () => {
    const md = generateMarkdown('/repo', 'main', [makeFile('a.ts', { adds: 1 })], [], '2026-01-01T00:00:00Z');
    expect(md).toContain('`/repo`');
    expect(md).toContain('`main`');
  });

  it('includes file count', () => {
    const files = [makeFile('a.ts'), makeFile('b.ts')];
    const md = generateMarkdown('/repo', 'main', files, [], '2026-01-01T00:00:00Z');
    expect(md).toContain('2 files');
  });

  it('includes skipped files section when present', () => {
    const md = generateMarkdown('/repo', 'main', [makeFile('a.ts')], ['image.png', 'lock.yaml'], '2026-01-01T00:00:00Z');
    expect(md).toContain('## Skipped Files');
    expect(md).toContain('`image.png`');
    expect(md).toContain('`lock.yaml`');
  });

  it('omits skipped section when empty', () => {
    const md = generateMarkdown('/repo', 'main', [makeFile('a.ts')], [], '2026-01-01T00:00:00Z');
    expect(md).not.toContain('## Skipped Files');
  });

  it('shows file statuses correctly', () => {
    const files = [
      makeFile('new.ts', { isNew: true }),
      makeFile('del.ts', { isDeleted: true }),
      makeFile('mod.ts'),
    ];
    const md = generateMarkdown('/repo', 'main', files, [], '2026-01-01T00:00:00Z');
    expect(md).toContain('*(added)*');
    expect(md).toContain('*(deleted)*');
    expect(md).toContain('*(modified)*');
  });

  it('includes timestamp', () => {
    const ts = '2026-07-05T12:00:00Z';
    const md = generateMarkdown('/repo', 'main', [makeFile('a.ts')], [], ts);
    expect(md).toContain(ts);
  });
});
