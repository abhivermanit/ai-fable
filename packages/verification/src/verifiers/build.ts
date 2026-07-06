import type { Verifier, VerifierResult, VerificationContext } from '../types.js';
import { runCommand, buildResult } from './base.js';

/**
 * Build verifier.
 *
 * Runs the project's build command and checks for success.
 * Defaults to `npm run build` but is configurable.
 */
export class BuildVerifier implements Verifier {
  readonly name = 'build';
  private readonly command: string;
  private readonly timeoutMs: number;

  constructor(options: { command?: string; timeoutMs?: number } = {}) {
    this.command = options.command ?? 'npm run build';
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async verify(context: VerificationContext): Promise<VerifierResult> {
    const result = await runCommand(this.command, context, this.timeoutMs);
    return buildResult(this.name, result, {
      passMessage: 'Build completed successfully',
      failMessage: `Build failed (exit ${result.exitCode})`,
    });
  }
}
