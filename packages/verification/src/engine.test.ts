import { describe, it, expect, vi } from 'vitest';
import { VerificationEngine } from './engine.js';
import type {
  Verifier,
  VerifierResult,
  VerificationContext,
  AcceptancePolicy,
} from './types.js';

/** Create a verifier stub that returns a given status. */
function makeVerifier(name: string, status: 'pass' | 'fail' | 'error', durationMs = 10): Verifier {
  return {
    name,
    async verify(): Promise<VerifierResult> {
      return {
        name,
        status,
        evidence: {
          verifier: name,
          status,
          message: `${name}: ${status}`,
          durationMs,
          artifacts: [],
          timestamp: new Date().toISOString(),
        },
      };
    },
  };
}

/** Create a slow verifier that can be aborted. */
function makeSlowVerifier(name: string, delayMs: number): Verifier {
  return {
    name,
    async verify(context: VerificationContext): Promise<VerifierResult> {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        context.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
      return {
        name,
        status: 'pass',
        evidence: {
          verifier: name,
          status: 'pass',
          message: `${name} passed`,
          durationMs: delayMs,
          artifacts: [],
          timestamp: new Date().toISOString(),
        },
      };
    },
  };
}

/** Create a verifier that throws (badly behaved). */
function makeThrowingVerifier(name: string): Verifier {
  return {
    name,
    async verify(): Promise<VerifierResult> {
      throw new Error(`${name} exploded`);
    },
  };
}

function defaultPolicy(): AcceptancePolicy {
  return {
    requireAll: true,
    rules: [
      { verifier: 'build', required: true },
      { verifier: 'tests', required: true },
      { verifier: 'lint', required: false },
    ],
  };
}

const defaultContext: VerificationContext = { cwd: '/tmp/test' };

describe('VerificationEngine', () => {
  describe('all verifiers pass', () => {
    it('returns accepted status', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'pass'),
          makeVerifier('tests', 'pass'),
          makeVerifier('lint', 'pass'),
        ],
        policy: defaultPolicy(),
      });

      const report = await engine.verify(defaultContext);

      expect(report.overallStatus).toBe('accepted');
      expect(report.results).toHaveLength(3);
      expect(report.failedRequired).toHaveLength(0);
      expect(report.failedAdvisory).toHaveLength(0);
    });

    it('collects evidence from all verifiers', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'pass'),
          makeVerifier('tests', 'pass'),
        ],
        policy: defaultPolicy(),
      });

      const report = await engine.verify(defaultContext);

      expect(report.evidence).toHaveLength(2);
      expect(report.evidence[0].verifier).toBe('build');
      expect(report.evidence[1].verifier).toBe('tests');
    });

    it('includes timestamps', async () => {
      const engine = new VerificationEngine({
        verifiers: [makeVerifier('build', 'pass')],
        policy: defaultPolicy(),
      });

      const report = await engine.verify(defaultContext);

      expect(report.startedAt).toBeDefined();
      expect(report.completedAt).toBeDefined();
      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes the policy in the report', async () => {
      const policy = defaultPolicy();
      const engine = new VerificationEngine({
        verifiers: [makeVerifier('build', 'pass')],
        policy,
      });

      const report = await engine.verify(defaultContext);
      expect(report.policy).toEqual(policy);
    });
  });

  describe('required verifier fails', () => {
    it('returns rejected status', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'fail'),
          makeVerifier('tests', 'pass'),
          makeVerifier('lint', 'pass'),
        ],
        policy: defaultPolicy(),
      });

      const report = await engine.verify(defaultContext);

      expect(report.overallStatus).toBe('rejected');
      expect(report.failedRequired).toEqual(['build']);
    });

    it('stops execution by default on required failure', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'fail'),
          makeVerifier('tests', 'pass'),
          makeVerifier('lint', 'pass'),
        ],
        policy: defaultPolicy(),
        continueOnFailure: false,
      });

      const report = await engine.verify(defaultContext);

      // tests and lint should be skipped
      expect(report.results[1].status).toBe('skip');
      expect(report.results[2].status).toBe('skip');
    });

    it('continues execution when continueOnFailure is true', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'fail'),
          makeVerifier('tests', 'pass'),
          makeVerifier('lint', 'pass'),
        ],
        policy: defaultPolicy(),
        continueOnFailure: true,
      });

      const report = await engine.verify(defaultContext);

      // All were run
      expect(report.results[1].status).toBe('pass');
      expect(report.results[2].status).toBe('pass');
      expect(report.overallStatus).toBe('rejected');
    });
  });

  describe('advisory verifier fails', () => {
    it('still returns accepted when only advisory fails', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'pass'),
          makeVerifier('tests', 'pass'),
          makeVerifier('lint', 'fail'),
        ],
        policy: defaultPolicy(),
      });

      const report = await engine.verify(defaultContext);

      expect(report.overallStatus).toBe('accepted');
      expect(report.failedAdvisory).toEqual(['lint']);
      expect(report.failedRequired).toHaveLength(0);
    });
  });

  describe('verifier throws unexpectedly', () => {
    it('wraps the error as status=error', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeThrowingVerifier('build'),
          makeVerifier('tests', 'pass'),
        ],
        policy: defaultPolicy(),
        continueOnFailure: true,
      });

      const report = await engine.verify(defaultContext);

      expect(report.results[0].status).toBe('error');
      expect(report.results[0].evidence.message).toContain('exploded');
      expect(report.overallStatus).toBe('rejected');
      expect(report.failedRequired).toContain('build');
    });
  });

  describe('abort signal', () => {
    it('skips remaining verifiers when aborted', async () => {
      const controller = new AbortController();
      controller.abort(); // Already aborted

      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'pass'),
          makeVerifier('tests', 'pass'),
        ],
        policy: defaultPolicy(),
      });

      const report = await engine.verify({ cwd: '/tmp', signal: controller.signal });

      expect(report.results[0].status).toBe('skip');
      expect(report.results[1].status).toBe('skip');
      // Skipped verifiers don't fail the policy
      expect(report.overallStatus).toBe('accepted');
    });
  });

  describe('parallel execution', () => {
    it('runs all verifiers concurrently', async () => {
      const start = Date.now();
      const engine = new VerificationEngine({
        verifiers: [
          makeSlowVerifier('v1', 50),
          makeSlowVerifier('v2', 50),
          makeSlowVerifier('v3', 50),
        ],
        policy: { requireAll: true, rules: [] },
        parallel: true,
      });

      const report = await engine.verify(defaultContext);

      // If parallel, total time should be ~50ms not ~150ms
      expect(report.totalDurationMs).toBeLessThan(120);
      expect(report.results).toHaveLength(3);
      expect(report.results.every((r) => r.status === 'pass')).toBe(true);
    });
  });

  describe('verifiers not in policy (unlisted)', () => {
    it('treats unlisted verifiers as advisory', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'pass'),
          makeVerifier('unknown-verifier', 'fail'),
        ],
        policy: {
          requireAll: true,
          rules: [{ verifier: 'build', required: true }],
          // 'unknown-verifier' has no rule
        },
        continueOnFailure: true,
      });

      const report = await engine.verify(defaultContext);

      expect(report.overallStatus).toBe('accepted');
      expect(report.failedAdvisory).toEqual(['unknown-verifier']);
    });
  });

  describe('empty verifiers', () => {
    it('returns accepted with no results', async () => {
      const engine = new VerificationEngine({
        verifiers: [],
        policy: { requireAll: true, rules: [] },
      });

      const report = await engine.verify(defaultContext);

      expect(report.overallStatus).toBe('accepted');
      expect(report.results).toHaveLength(0);
      expect(report.evidence).toHaveLength(0);
    });
  });

  describe('multiple required failures', () => {
    it('reports all required failures', async () => {
      const engine = new VerificationEngine({
        verifiers: [
          makeVerifier('build', 'fail'),
          makeVerifier('tests', 'fail'),
          makeVerifier('lint', 'fail'),
        ],
        policy: defaultPolicy(),
        continueOnFailure: true,
      });

      const report = await engine.verify(defaultContext);

      expect(report.overallStatus).toBe('rejected');
      expect(report.failedRequired).toContain('build');
      expect(report.failedRequired).toContain('tests');
      expect(report.failedAdvisory).toContain('lint');
    });
  });
});
