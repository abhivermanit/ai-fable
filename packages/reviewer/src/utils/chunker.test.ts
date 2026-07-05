import { describe, it, expect } from 'vitest';
import { chunkDiff } from './chunker.js';
import type { DiffFile } from '@ai-fable/core';

function makeFile(path: string, lineCount: number): DiffFile {
  const lines = Array.from({ length: lineCount }, (_, i) => `+line ${i}`);
  return {
    filePath: path,
    isNew: true,
    isDeleted: false,
    isRenamed: false,
    isBinary: false,
    hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: lineCount, lines }],
  };
}

describe('chunkDiff', () => {
  it('returns empty array for no files', () => {
    expect(chunkDiff([])).toEqual([]);
  });

  it('puts all small files in one chunk', () => {
    const files = [makeFile('a.ts', 5), makeFile('b.ts', 5)];
    const chunks = chunkDiff(files, 10000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.files).toHaveLength(2);
    expect(chunks[0]!.index).toBe(0);
    expect(chunks[0]!.total).toBe(1);
  });

  it('splits files into multiple chunks based on size', () => {
    // Each file ~600 chars (100 lines * ~6 chars each)
    const files = [makeFile('a.ts', 100), makeFile('b.ts', 100), makeFile('c.ts', 100)];
    const chunks = chunkDiff(files, 700);
    expect(chunks.length).toBeGreaterThan(1);

    // All files accounted for
    const totalFiles = chunks.reduce((sum, c) => sum + c.files.length, 0);
    expect(totalFiles).toBe(3);
  });

  it('never splits a file across chunks', () => {
    const files = [makeFile('big.ts', 500)]; // Single large file
    const chunks = chunkDiff(files, 100); // Small chunk size
    expect(chunks).toHaveLength(1); // Still one chunk
    expect(chunks[0]!.files).toHaveLength(1);
  });

  it('preserves file order', () => {
    const files = [makeFile('a.ts', 10), makeFile('b.ts', 10), makeFile('c.ts', 10)];
    const chunks = chunkDiff(files, 5000);
    const allPaths = chunks.flatMap((c) => c.files.map((f) => f.filePath));
    expect(allPaths).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('sets correct index and total on each chunk', () => {
    const files = [makeFile('a.ts', 100), makeFile('b.ts', 100), makeFile('c.ts', 100)];
    const chunks = chunkDiff(files, 700);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.index).toBe(i);
      expect(chunks[i]!.total).toBe(chunks.length);
    }
  });
});
