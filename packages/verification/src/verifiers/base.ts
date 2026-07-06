import { exec } from '@ai-fable/runtime';
import type { ShellResult } from '@ai-fable/runtime';
import type { VerifierResult, VerificationContext, Evidence } from '../types.js';

/**
 * Helper to run a shell command within a verification context.
 */
export async function runCommand(
  command: string,
  context: VerificationContext,
  timeoutMs: number = 120_000,
): Promise<ShellResult> {
  return exec(command, {
    cwd: context.cwd,
    signal: context.signal,
    timeoutMs,
  });
}

/**
 * Build a VerifierResult from a shell command outcome.
 */
export function buildResult(
  name: string,
  result: ShellResult,
  options: {
    passMessage?: string;
    failMessage?: string;
    artifacts?: string[];
    details?: Record<string, unknown>;
  } = {},
): VerifierResult {
  const passed = result.exitCode === 0;
  const status = result.timedOut
    ? 'timeout' as const
    : result.aborted
      ? 'skip' as const
      : passed
        ? 'pass' as const
        : 'fail' as const;

  const message = result.timedOut
    ? `${name} timed out`
    : result.aborted
      ? `${name} was aborted`
      : passed
        ? (options.passMessage ?? `${name} passed`)
        : (options.failMessage ?? `${name} failed (exit ${result.exitCode})`);

  const evidence: Evidence = {
    verifier: name,
    status,
    message,
    durationMs: result.durationMs,
    artifacts: options.artifacts ?? [],
    details: {
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 5000), // Cap evidence size
      stderr: result.stderr.slice(0, 5000),
      ...options.details,
    },
    timestamp: new Date().toISOString(),
  };

  return { name, status, evidence };
}
