import { describe, it, expect } from 'vitest';
import { FileRegistry } from './file-registry.js';
import { Language } from './types.js';
import type { FileEntry } from './types.js';

function makeEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    path: '/repo/src/index.ts',
    relativePath: 'src/index.ts',
    language: Language.TypeScript,
    size: 100,
    hash: 'abc123',
    lastModified: '2026-01-01T00:00:00.000Z',
    isBinary: false,
    ...overrides,
  };
}

describe('FileRegistry', () => {
  it('starts empty', () => {
    const reg = new FileRegistry();
    expect(reg.size).toBe(0);
    expect(reg.all()).toEqual([]);
  });

  it('set() adds a new entry and returns true', () => {
    const reg = new FileRegistry();
    const changed = reg.set(makeEntry());
    expect(changed).toBe(true);
    expect(reg.size).toBe(1);
  });

  it('set() returns false for unchanged entry', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry());
    const changed = reg.set(makeEntry());
    expect(changed).toBe(false);
  });

  it('set() returns true when hash changes', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry({ hash: 'v1' }));
    const changed = reg.set(makeEntry({ hash: 'v2' }));
    expect(changed).toBe(true);
  });

  it('get() returns entry by relative path', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry());
    expect(reg.get('src/index.ts')?.language).toBe(Language.TypeScript);
  });

  it('get() returns undefined for missing entry', () => {
    const reg = new FileRegistry();
    expect(reg.get('nope.ts')).toBeUndefined();
  });

  it('has() checks existence', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry());
    expect(reg.has('src/index.ts')).toBe(true);
    expect(reg.has('nope.ts')).toBe(false);
  });

  it('delete() removes an entry', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry());
    expect(reg.delete('src/index.ts')).toBe(true);
    expect(reg.size).toBe(0);
  });

  it('byLanguage() filters entries', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry({ relativePath: 'a.ts', language: Language.TypeScript }));
    reg.set(makeEntry({ relativePath: 'b.js', language: Language.JavaScript }));
    reg.set(makeEntry({ relativePath: 'c.ts', language: Language.TypeScript }));

    expect(reg.byLanguage(Language.TypeScript)).toHaveLength(2);
    expect(reg.byLanguage(Language.JavaScript)).toHaveLength(1);
  });

  it('byPattern() filters by regex', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry({ relativePath: 'src/foo.test.ts' }));
    reg.set(makeEntry({ relativePath: 'src/foo.ts' }));
    reg.set(makeEntry({ relativePath: 'src/bar.test.ts' }));

    expect(reg.byPattern(/\.test\.ts$/)).toHaveLength(2);
  });

  it('load() detects new, changed, and deleted files', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry({ relativePath: 'a.ts', hash: 'old' }));
    reg.set(makeEntry({ relativePath: 'deleted.ts', hash: 'x' }));

    const changed = reg.load([
      makeEntry({ relativePath: 'a.ts', hash: 'new' }), // changed
      makeEntry({ relativePath: 'b.ts', hash: 'fresh' }), // new
    ]);

    expect(changed.has('a.ts')).toBe(true); // changed
    expect(changed.has('b.ts')).toBe(true); // new
    expect(changed.has('deleted.ts')).toBe(true); // deleted
    expect(reg.has('deleted.ts')).toBe(false);
  });

  it('serializes and deserializes', () => {
    const reg = new FileRegistry();
    reg.set(makeEntry({ relativePath: 'a.ts' }));
    reg.set(makeEntry({ relativePath: 'b.ts' }));

    const json = reg.toJSON();
    const restored = FileRegistry.fromJSON(json);

    expect(restored.size).toBe(2);
    expect(restored.has('a.ts')).toBe(true);
    expect(restored.has('b.ts')).toBe(true);
  });
});
