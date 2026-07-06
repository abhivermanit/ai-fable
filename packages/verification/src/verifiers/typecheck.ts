import type { Verifier, VerifierResult, VerificationContext } from '../types.js';
import { runCommand, buildResult } from './base.js';

/**
 * Type verifier.
 *
 * Runs TypeScript type checking and reports errors.
 * Defaults to `npx tsc --noEmit` but is configurable.
 */
export class TypecheckVerifier implements Verifier {
  readonly name = 'typecheck';
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: { command?: string; timeoutMs?: number } = {}) {
    this.command = options.command ?? 'npx tsc --noEmit';
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async verify(context: VerificationContext): Promise<VerifierResult> {
    const result = await runCommand(this.command, context, this.timeoutMs);

    // Count type errors from output
    const errorCount = countTypeErrors(result.stdout + result.stderr);

    return buildResult(this.name, result, {
      passMessage: 'No type errors',
      failMessage: errorCount > 0
        ? `${errorCount} type error${errorCount === 1 ? '' : 's'} found`
        : `Type checking failed (exit ${result.exitCode})`,
      details: { errorCount },
    });
  }
}

/**
 * Count TypeScript errors from compiler output.
 */
function countTypeErrors(output: string): number {
  // tsc outputs "Found N errors" at the end
  const foundMatch = output.match(/Found\s+(\d+)\s+error/);
  if (foundMatch) return parseInt(foundMatch[1], 10);

  // Count individual "error TS" lines
  const errorLines = output.match(/error TS\d+/g);
  return errorLines?.length ?? 0;
}
