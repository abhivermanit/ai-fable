import { describe, it, expect } from 'vitest';
import { shouldSkip, filterFiles } from './filter.js';
import type { DiffFile } from '@ai-fable/core';

function makeDiffFile(filePath: string, opts: Partial<DiffFile> = {}): DiffFile {
  return {
    filePath,
    isNew: false,
    isDeleted: false,
    isRenamed: false,
    isBinary: false,
    hunks: [],
    ...opts,
  };
}

describe('shouldSkip', () => {
  it('skips binary files', () => {
    expect(shouldSkip('file.ts', true)).toBe(true);
  });

  it('skips files in node_modules', () => {
    expect(shouldSkip('node_modules/pkg/index.js', false)).toBe(true);
  });

  it('skips files in dist/', () => {
    expect(shouldSkip('dist/index.js', false)).toBe(true);
  });

  it('skips files in build/', () => {
    expect(shouldSkip('build/output.js', false)).toBe(true);
  });

  it('skips files in coverage/', () => {
    expect(shouldSkip('coverage/lcov.info', false)).toBe(true);
  });

  it('skips files in .turbo/', () => {
    expect(shouldSkip('.turbo/cache/hash', false)).toBe(true);
  });

  it('skips files in .git/', () => {
    expect(shouldSkip('.git/config', false)).toBe(true);
  });

  it('skips image files', () => {
    expect(shouldSkip('assets/logo.png', false)).toBe(true);
    expect(shouldSkip('icon.jpg', false)).toBe(true);
    expect(shouldSkip('photo.jpeg', false)).toBe(true);
    expect(shouldSkip('animation.gif', false)).toBe(true);
    expect(shouldSkip('vector.svg', false)).toBe(true);
    expect(shouldSkip('image.webp', false)).toBe(true);
    expect(shouldSkip('favicon.ico', false)).toBe(true);
  });

  it('skips archive files', () => {
    expect(shouldSkip('archive.zip', false)).toBe(true);
    expect(shouldSkip('backup.tar', false)).toBe(true);
    expect(shouldSkip('compressed.gz', false)).toBe(true);
    expect(shouldSkip('package.rar', false)).toBe(true);
  });

  it('skips lockfiles', () => {
    expect(shouldSkip('pnpm-lock.yaml', false)).toBe(true);
    expect(shouldSkip('package-lock.json', false)).toBe(true);
    expect(shouldSkip('yarn.lock', false)).toBe(true);
  });

  it('does not skip regular source files', () => {
    expect(shouldSkip('src/index.ts', false)).toBe(false);
    expect(shouldSkip('README.md', false)).toBe(false);
    expect(shouldSkip('package.json', false)).toBe(false);
    expect(shouldSkip('.eslintrc.json', false)).toBe(false);
  });

  it('skips nested node_modules', () => {
    expect(shouldSkip('packages/reviewer/node_modules/dep/index.js', false)).toBe(true);
  });
});

describe('filterFiles', () => {
  it('separates reviewable from skipped', () => {
    const files = [
      makeDiffFile('src/index.ts'),
      makeDiffFile('image.png'),
      makeDiffFile('pnpm-lock.yaml'),
      makeDiffFile('src/utils.ts'),
      makeDiffFile('node_modules/pkg/index.js'),
    ];

    const { reviewable, skipped } = filterFiles(files);
    expect(reviewable).toHaveLength(2);
    expect(reviewable[0]!.filePath).toBe('src/index.ts');
    expect(reviewable[1]!.filePath).toBe('src/utils.ts');
    expect(skipped).toEqual(['image.png', 'pnpm-lock.yaml', 'node_modules/pkg/index.js']);
  });

  it('marks isBinary files as skipped', () => {
    const files = [makeDiffFile('data.bin', { isBinary: true })];
    const { reviewable, skipped } = filterFiles(files);
    expect(reviewable).toHaveLength(0);
    expect(skipped).toEqual(['data.bin']);
  });

  it('returns all files when none should be skipped', () => {
    const files = [makeDiffFile('src/a.ts'), makeDiffFile('src/b.ts')];
    const { reviewable, skipped } = filterFiles(files);
    expect(reviewable).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });
});
