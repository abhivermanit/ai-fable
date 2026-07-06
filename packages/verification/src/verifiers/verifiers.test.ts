import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BuildVerifier } from './build.js';
import { TestVerifier } from './test.js';
import { TypecheckVerifier } from './typecheck.js';
import { LintVerifier } from './lint.js';
import type { VerificationContext } from '../types.js';

describe('Concrete Verifiers', () => {
  const testDir = join(tmpdir(), `verification-verifiers-${Date.now()}`);
  let context: VerificationContext;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });

    // Create a minimal project that passes all checks
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      scripts: {
        build: 'echo "build ok"',
        test: 'echo "Tests  3 passed (3)"',
        lint: 'echo "no lint errors"',
        typecheck: 'echo "no type errors"',
      },
    }));

    context = { cwd: testDir };
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('BuildVerifier', () => {
    it('passes when command succeeds', async () => {
      const verifier = new BuildVerifier({ command: 'echo "build ok"' });
      const result = await verifier.verify(context);

      expect(result.name).toBe('build');
      expect(result.status).toBe('pass');
      expect(result.evidence.message).toContain('successfully');
    });

    it('fails when command returns non-zero', async () => {
      const verifier = new BuildVerifier({ command: 'exit 1' });
      const result = await verifier.verify(context);

      expect(result.status).toBe('fail');
      expect(result.evidence.message).toContain('failed');
    });

    it('reports timeout status on timeout', async () => {
      const verifier = new BuildVerifier({ command: 'sleep 60', timeoutMs: 50 });
      const result = await verifier.verify(context);

      expect(result.status).toBe('timeout');
      expect(result.evidence.message).toContain('timed out');
    });

    it('captures duration', async () => {
      const verifier = new BuildVerifier({ command: 'sleep 0.05' });
      const result = await verifier.verify(context);

      expect(result.evidence.durationMs).toBeGreaterThanOrEqual(30);
    });
  });

  describe('TestVerifier', () => {
    it('passes when tests succeed', async () => {
      const verifier = new TestVerifier({ command: 'echo "Tests  5 passed (5)"' });
      const result = await verifier.verify(context);

      expect(result.status).toBe('pass');
      expect(result.evidence.message).toContain('5 tests');
    });

    it('fails when tests fail', async () => {
      const verifier = new TestVerifier({ command: 'exit 1' });
      const result = await verifier.verify(context);

      expect(result.status).toBe('fail');
    });

    it('passes without test count extraction', async () => {
      const verifier = new TestVerifier({ command: 'echo "all good"' });
      const result = await verifier.verify(context);

      expect(result.status).toBe('pass');
      expect(result.evidence.message).toBe('Tests passed');
    });
  });

  describe('TypecheckVerifier', () => {
    it('passes when no type errors', async () => {
      const verifier = new TypecheckVerifier({ command: 'echo "no errors"' });
      const result = await verifier.verify(context);

      expect(result.status).toBe('pass');
      expect(result.evidence.message).toContain('No type errors');
    });

    it('fails with error count from output', async () => {
      const verifier = new TypecheckVerifier({
        command: 'echo "Found 3 errors in 2 files" && exit 1',
      });
      const result = await verifier.verify(context);

      expect(result.status).toBe('fail');
      expect(result.evidence.message).toContain('3 type error');
    });
  });

  describe('LintVerifier', () => {
    it('passes when no lint issues', async () => {
      const verifier = new LintVerifier({ command: 'echo "clean"' });
      const result = await verifier.verify(context);

      expect(result.status).toBe('pass');
      expect(result.evidence.message).toContain('No lint errors');
    });

    it('fails with problem count from output', async () => {
      const verifier = new LintVerifier({
        command: 'echo "✖ 7 problems (5 errors, 2 warnings)" && exit 1',
      });
      const result = await verifier.verify(context);

      expect(result.status).toBe('fail');
      expect(result.evidence.message).toContain('7 lint problem');
    });
  });

  describe('abort handling', () => {
    it('verifier respects abort signal (via shell)', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      const verifier = new BuildVerifier({ command: 'sleep 60' });
      const result = await verifier.verify({ cwd: testDir, signal: controller.signal });

      expect(result.status).toBe('skip'); // aborted → skip
      expect(result.evidence.message).toContain('aborted');
    });
  });
});
