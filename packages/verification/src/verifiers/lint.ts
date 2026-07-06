import type { Verifier, VerifierResult, VerificationContext } from '../types.js';
import { runCommand, buildResult } from './base.js';

/**
 * Lint verifier.
 *
 * Runs the project's linter and checks for errors.
 * Defaults to `npm run lint` but is configurable.
 */
export class LintVerifier implements Verifier {
  readonly name = 'lint';
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: { command?: string; timeoutMs?: number } = {}) {
    this.command = options.command ?? 'npm run lint';
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async verify(context: VerificationContext): Promise<VerifierResult> {
    const result = await runCommand(this.command, context, this.timeoutMs);

    // Try to extract problem count from ESLint output
    const problemCount = extractProblemCount(result.stdout + result.stderr);

    return buildResult(this.name, result, {
      passMessage: 'No lint errors',
      failMessage: problemCount !== undefined
        ? `${problemCount} lint problem${problemCount === 1 ? '' : 's'} found`
        : `Lint check failed (exit ${result.exitCode})`,
      details: problemCount !== undefined ? { problemCount } : undefined,
    });
  }
}

/**
 * Extract problem count from ESLint output.
 */
function extractProblemCount(output: string): number | undefined {
  // ESLint: "✖ 5 problems (3 errors, 2 warnings)"
  const eslintMatch = output.match(/✖\s+(\d+)\s+problem/);
  if (eslintMatch) return parseInt(eslintMatch[1], 10);

  // ESLint compact: "N problems"
  const compactMatch = output.match(/(\d+)\s+problem/);
  if (compactMatch) return parseInt(compactMatch[1], 10);

  return undefined;
}
