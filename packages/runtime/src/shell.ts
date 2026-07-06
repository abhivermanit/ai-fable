import { spawn } from 'node:child_process';
import type { ShellResult, ShellOptions } from './types.js';

/** Default timeout: 30 seconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default max buffer: 5MB */
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024;

/**
 * Execute a shell command and return the result.
 *
 * Supports:
 * - Timeout-based killing
 * - AbortSignal-based cancellation
 * - stdout/stderr capture with buffer limits
 * - Exit code and duration tracking
 */
export async function exec(command: string, options: ShellOptions = {}): Promise<ShellResult> {
  const {
    cwd = process.cwd(),
    env,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    maxBuffer = DEFAULT_MAX_BUFFER,
  } = options;

  const startTime = Date.now();
  let timedOut = false;
  let aborted = false;

  return new Promise<ShellResult>((resolve) => {
    const child = spawn('sh', ['-c', command], {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let resolved = false;

    const finish = (exitCode: number) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut,
        aborted,
        durationMs: Date.now() - startTime,
      });
    };

    // Timeout
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    // Abort signal
    if (signal) {
      if (signal.aborted) {
        aborted = true;
        child.kill('SIGKILL');
      } else {
        signal.addEventListener('abort', () => {
          aborted = true;
          child.kill('SIGKILL');
        }, { once: true });
      }
    }

    // Capture stdout
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBytes < maxBuffer) {
        const str = chunk.toString();
        stdout += str;
        stdoutBytes += chunk.length;
      }
    });

    // Capture stderr
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBytes < maxBuffer) {
        const str = chunk.toString();
        stderr += str;
        stderrBytes += chunk.length;
      }
    });

    child.on('close', (code) => {
      finish(code ?? 1);
    });

    child.on('error', (err) => {
      stderr += err.message;
      finish(1);
    });
  });
}

/**
 * Execute a command and throw if it fails (non-zero exit).
 */
export async function execOrThrow(command: string, options: ShellOptions = {}): Promise<ShellResult> {
  const result = await exec(command, options);
  if (result.exitCode !== 0) {
    const msg = result.timedOut
      ? `Command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms: ${command}`
      : result.aborted
        ? `Command aborted: ${command}`
        : `Command failed (exit ${result.exitCode}): ${command}\n${result.stderr}`;
    throw new ShellError(msg, result);
  }
  return result;
}

/**
 * Error thrown when a shell command fails.
 */
export class ShellError extends Error {
  public readonly result: ShellResult;

  constructor(message: string, result: ShellResult) {
    super(message);
    this.name = 'ShellError';
    this.result = result;
  }
}
