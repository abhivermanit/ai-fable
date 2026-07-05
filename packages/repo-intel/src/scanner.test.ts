import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanRepository, detectLanguage, isBinaryFile, hashContent } from './scanner.js';
import { Language } from './types.js';

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('foo.ts')).toBe(Language.TypeScript);
    expect(detectLanguage('foo.tsx')).toBe(Language.TypeScript);
  });

  it('detects JavaScript', () => {
    expect(detectLanguage('foo.js')).toBe(Language.JavaScript);
    expect(detectLanguage('foo.mjs')).toBe(Language.JavaScript);
  });

  it('detects JSON', () => {
    expect(detectLanguage('package.json')).toBe(Language.JSON);
  });

  it('detects Markdown', () => {
    expect(detectLanguage('README.md')).toBe(Language.Markdown);
  });

  it('returns Unknown for unrecognized extensions', () => {
    expect(detectLanguage('data.xyz')).toBe(Language.Unknown);
  });
});

describe('isBinaryFile', () => {
  it('recognizes image files as binary', () => {
    expect(isBinaryFile('logo.png')).toBe(true);
    expect(isBinaryFile('photo.jpg')).toBe(true);
  });

  it('recognizes lock files as binary', () => {
    expect(isBinaryFile('pnpm-lock.lock')).toBe(true);
  });

  it('does not flag source files as binary', () => {
    expect(isBinaryFile('index.ts')).toBe(false);
    expect(isBinaryFile('README.md')).toBe(false);
  });
});

describe('hashContent', () => {
  it('produces consistent hashes', () => {
    const buf = Buffer.from('hello world');
    const h1 = hashContent(buf);
    const h2 = hashContent(buf);
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different content', () => {
    const h1 = hashContent(Buffer.from('a'));
    const h2 = hashContent(Buffer.from('b'));
    expect(h1).not.toBe(h2);
  });

  it('produces 64-char hex string (SHA-256)', () => {
    const hash = hashContent(Buffer.from('test'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('scanRepository', () => {
  const testDir = join(tmpdir(), `repo-intel-test-${Date.now()}`);

  beforeAll(() => {
    // Create test directory structure
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(testDir, '.git'), { recursive: true });

    writeFileSync(join(testDir, 'src', 'index.ts'), 'export const x = 1;');
    writeFileSync(join(testDir, 'src', 'utils.ts'), 'export function helper() {}');
    writeFileSync(join(testDir, 'package.json'), '{}');
    writeFileSync(join(testDir, 'logo.png'), Buffer.from([0x89, 0x50])); // binary
    writeFileSync(join(testDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}');
    writeFileSync(join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    writeFileSync(join(testDir, '.gitignore'), '*.log\n');
    writeFileSync(join(testDir, 'debug.log'), 'some log');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds source files', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const paths = entries.map((e) => e.relativePath);

    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/utils.ts');
    expect(paths).toContain('package.json');
  });

  it('skips node_modules', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const paths = entries.map((e) => e.relativePath);

    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('skips .git', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const paths = entries.map((e) => e.relativePath);

    expect(paths.some((p) => p.includes('.git/'))).toBe(false);
  });

  it('respects .gitignore', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const paths = entries.map((e) => e.relativePath);

    expect(paths).not.toContain('debug.log');
  });

  it('marks binary files', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const png = entries.find((e) => e.relativePath === 'logo.png');

    expect(png).toBeDefined();
    expect(png!.isBinary).toBe(true);
    expect(png!.hash).toBe(''); // no hash for binary
  });

  it('detects language for each file', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const ts = entries.find((e) => e.relativePath === 'src/index.ts');

    expect(ts!.language).toBe(Language.TypeScript);
  });

  it('computes content hash for text files', async () => {
    const entries = await scanRepository({ rootDir: testDir });
    const ts = entries.find((e) => e.relativePath === 'src/index.ts');

    expect(ts!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('respects extra ignore patterns', async () => {
    const entries = await scanRepository({
      rootDir: testDir,
      ignorePatterns: ['*.json'],
    });
    const paths = entries.map((e) => e.relativePath);

    expect(paths).not.toContain('package.json');
  });
});
