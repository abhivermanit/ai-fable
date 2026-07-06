import type { Verifier, VerifierResult, VerificationContext } from '../types.js';
import { runCommand, buildResult } from './base.js';

/**
 * Test verifier.
 *
 * Runs the project's test suite and checks for success.
 * Defaults to `npm test` but is configurable.
 */
export class TestVerifier implements Verifier {
  readonly name = 'tests';
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: { command?: string; timeoutMs?: number } = {}) {
    this.command = options.command ?? 'npm test';
    this.timeoutMs = options.timeoutMs ?? 300_000; // Tests can be slow
  }

  async verify(context: VerificationContext): Promise<VerifierResult> {
    const result = await runCommand(this.command, context, this.timeoutMs);

    // Try to extract test count from output (common patterns)
    const testCount = extractTestCount(result.stdout + result.stderr);

    return buildResult(this.name, result, {
      passMessage: testCount
        ? `Tests passed (${testCount} tests)`
        : 'Tests passed',
      failMessage: testCount
        ? `Tests failed (${testCount} tests, exit ${result.exitCode})`
        : `Tests failed (exit ${result.exitCode})`,
      details: testCount ? { testCount } : undefined,
    });
  }
}

/**
 * Try to extract a test count from output (vitest/jest patterns).
 */
function extractTestCount(output: string): string | undefined {
  // Vitest: "Tests  64 passed (64)"
  const vitestMatch = output.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (vitestMatch) return vitestMatch[2];

  // Jest: "Tests:  5 passed, 5 total"
  const jestMatch = output.match(/Tests:\s+.*?(\d+)\s+total/);
  if (jestMatch) return jestMatch[1];

  return undefined;
}
