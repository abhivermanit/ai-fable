import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileOps, FileAccessError } from './file-ops.js';
import type { SandboxConfig } from './types.js';

describe('FileOps', () => {
  const testDir = join(tmpdir(), `runtime-fileops-${Date.now()}`);
  let fileOps: FileOps;

  beforeAll(() => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    mkdirSync(join(testDir, 'protected'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'existing.ts'), 'const x = 1;');
    writeFileSync(join(testDir, 'protected', 'secret.env'), 'API_KEY=xxx');

    const config: SandboxConfig = {
      cwd: testDir,
      env: {},
      timeoutMs: 30_000,
      maxBuffer: 5 * 1024 * 1024,
      allowedWritePaths: [],
      protectedPaths: ['protected'],
    };
    fileOps = new FileOps(config);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('reads an existing file', async () => {
      const content = await fileOps.read('src/existing.ts');
      expect(content).toBe('const x = 1;');
    });

    it('throws for non-existent file', async () => {
      await expect(fileOps.read('nope.ts')).rejects.toThrow();
    });

    it('throws for paths outside sandbox', async () => {
      await expect(fileOps.read('../../../etc/passwd')).rejects.toThrow(FileAccessError);
    });
  });

  describe('write', () => {
    it('writes a new file', async () => {
      const result = await fileOps.write('src/new.ts', 'export const y = 2;');
      expect(result.success).toBe(true);

      const content = await fileOps.read('src/new.ts');
      expect(content).toBe('export const y = 2;');
    });

    it('creates parent directories', async () => {
      const result = await fileOps.write('src/deep/nested/file.ts', 'nested');
      expect(result.success).toBe(true);

      const content = await fileOps.read('src/deep/nested/file.ts');
      expect(content).toBe('nested');
    });

    it('throws for protected paths', async () => {
      expect(() => {
        // Force sync assertion check by calling the method
      }).not.toThrow();
      // The actual assertion happens inside write()
      await expect(fileOps.write('protected/hack.txt', 'nope')).rejects.toThrow(FileAccessError);
    });
  });

  describe('patch', () => {
    it('replaces text in a file', async () => {
      await fileOps.write('src/patch-target.ts', 'const old = "hello";');
      const result = await fileOps.patch('src/patch-target.ts', 'old', 'new');
      expect(result.success).toBe(true);

      const content = await fileOps.read('src/patch-target.ts');
      expect(content).toBe('const new = "hello";');
    });

    it('fails if old text not found', async () => {
      await fileOps.write('src/no-match.ts', 'abc');
      const result = await fileOps.patch('src/no-match.ts', 'xyz', 'replaced');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('delete', () => {
    it('deletes an existing file', async () => {
      await fileOps.write('src/to-delete.ts', 'temp');
      const result = await fileOps.delete('src/to-delete.ts');
      expect(result.success).toBe(true);

      const exists = await fileOps.exists('src/to-delete.ts');
      expect(exists).toBe(false);
    });

    it('throws for protected paths', async () => {
      await expect(fileOps.delete('protected/secret.env')).rejects.toThrow(FileAccessError);
    });
  });

  describe('exists', () => {
    it('returns true for existing file', async () => {
      expect(await fileOps.exists('src/existing.ts')).toBe(true);
    });

    it('returns false for non-existent file', async () => {
      expect(await fileOps.exists('nope.ts')).toBe(false);
    });
  });

  describe('listDir', () => {
    it('lists directory contents', async () => {
      const entries = await fileOps.listDir('src');
      expect(entries).toContain('existing.ts');
    });

    it('throws for paths outside sandbox', async () => {
      await expect(fileOps.listDir('../../../')).rejects.toThrow(FileAccessError);
    });
  });

  describe('append', () => {
    it('appends to an existing file', async () => {
      await fileOps.write('src/appendable.ts', 'line1\n');
      await fileOps.append('src/appendable.ts', 'line2\n');

      const content = await fileOps.read('src/appendable.ts');
      expect(content).toBe('line1\nline2\n');
    });

    it('creates file if it does not exist', async () => {
      await fileOps.append('src/new-append.ts', 'first line');
      const content = await fileOps.read('src/new-append.ts');
      expect(content).toBe('first line');
    });
  });

  describe('allowed write paths', () => {
    it('restricts writes to allowed paths when configured', async () => {
      const restrictedOps = new FileOps({
        cwd: testDir,
        env: {},
        timeoutMs: 30_000,
        maxBuffer: 5 * 1024 * 1024,
        allowedWritePaths: ['src'],
        protectedPaths: [],
      });

      // Allowed
      const result = await restrictedOps.write('src/allowed.ts', 'ok');
      expect(result.success).toBe(true);

      // Not allowed (root level)
      await expect(restrictedOps.write('root-file.ts', 'nope')).rejects.toThrow(FileAccessError);
    });
  });
});
