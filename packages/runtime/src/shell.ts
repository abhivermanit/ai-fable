import { spawn } from 'node:child_process';
import type { ShellResult, ShellOptions } from './types.js';

/** Default timeout: 30 seconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default max buffer: 5MB */
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024;

/**
 * Abstraction for platform-specific shell invocation.
 *
 * The current implementation provides PosixShellAdapter (macOS/Linux).
 * A WindowsShellAdapter can be added in the future without changing
 * the exec/execOrThrow API.
 *
 * TODO: Implement WindowsShellAdapter using cmd.exe or PowerShell
 * for cross-platform support.
 */
export interface ShellAdapter {
  /** The shell binary to invoke (e.g., 'sh', 'cmd.exe') */
  readonly shell: string;
  /** Arguments to pass before the command (e.g., ['-c'] for sh) */
  args(command: string): string[];
}

/**
 * POSIX shell adapter (macOS/Linux).
 * Uses /bin/sh -c to execute commands.
 */
export class PosixShellAdapter implements ShellAdapter {
  readonly shell = 'sh';

  args(command: string): string[] {
    return ['-c', command];
  }
}

// TODO: Implement WindowsShellAdapter for cross-platform support
// export class WindowsShellAdapter implements ShellAdapter {
//   readonly shell = 'cmd.exe';
//   args(command: string): string[] { return ['/c', command]; }
// }

/** The active shell adapter. Change this to swap platforms. */
let activeAdapter: ShellAdapter = new PosixShellAdapter();

/**
 * Set the shell adapter (primarily for testing or platform switching).
 */
export function setShellAdapter(adapter: ShellAdapter): void {
  activeAdapter = adapter;
}

/**
 * Get the current shell adapter.
 */
export function getShellAdapter(): ShellAdapter {
  return activeAdapter;
}

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
    const adapter = activeAdapter;
    const child = spawn(adapter.shell, adapter.args(command), {
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
      // Clean up abort listener to avoid leaks in long-running sessions
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
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
    let abortHandler: (() => void) | undefined;
    if (signal) {
      if (signal.aborted) {
        aborted = true;
        child.kill('SIGKILL');
      } else {
        abortHandler = () => {
          aborted = true;
          child.kill('SIGKILL');
        };
        signal.addEventListener('abort', abortHandler, { once: true });
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
