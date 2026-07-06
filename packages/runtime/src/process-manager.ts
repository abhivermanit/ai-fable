import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ManagedProcess, ShellOptions } from './types.js';

/** Default max concurrent processes */
const DEFAULT_MAX_PROCESSES = 10;

/**
 * Tracks and manages child processes spawned during task execution.
 *
 * Responsibilities:
 * - Track all running processes
 * - Enforce concurrency limits
 * - Kill processes on abort/timeout
 * - Clean up on context disposal
 */
export class ProcessManager {
  private processes = new Map<string, { info: ManagedProcess; child: ChildProcess }>();
  private maxProcesses: number;

  constructor(maxProcesses: number = DEFAULT_MAX_PROCESSES) {
    this.maxProcesses = maxProcesses;
  }

  /**
   * Spawn a managed process.
   *
   * Returns the process info. The process runs in the background
   * and is tracked until completion or kill.
   */
  spawn(command: string, options: ShellOptions = {}): ManagedProcess {
    if (this.runningCount >= this.maxProcesses) {
      throw new Error(
        `Process limit reached (${this.maxProcesses}). Cannot spawn: ${command}`,
      );
    }

    const id = randomUUID();
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const info: ManagedProcess = {
      id,
      pid: child.pid ?? 0,
      command,
      startedAt: new Date().toISOString(),
      status: 'running',
    };

    this.processes.set(id, { info, child });

    // Handle timeout
    let timer: NodeJS.Timeout | undefined;
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        this.kill(id);
        info.status = 'killed';
      }, options.timeoutMs);
    }

    // Handle abort
    if (options.signal) {
      if (options.signal.aborted) {
        this.kill(id);
      } else {
        options.signal.addEventListener('abort', () => this.kill(id), { once: true });
      }
    }

    // Track completion
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (info.status === 'running') {
        info.status = code === 0 ? 'completed' : 'failed';
        info.exitCode = code ?? 1;
      }
    });

    child.on('error', () => {
      if (timer) clearTimeout(timer);
      if (info.status === 'running') {
        info.status = 'failed';
        info.exitCode = 1;
      }
    });

    return info;
  }

  /**
   * Kill a managed process by ID.
   */
  kill(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry) return false;
    if (entry.info.status !== 'running') return false;

    entry.child.kill('SIGKILL');
    entry.info.status = 'killed';
    return true;
  }

  /**
   * Kill all running processes.
   */
  killAll(): number {
    let killed = 0;
    for (const [id, entry] of this.processes) {
      if (entry.info.status === 'running') {
        this.kill(id);
        killed++;
      }
    }
    return killed;
  }

  /**
   * Get a process by ID.
   */
  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id)?.info;
  }

  /**
   * List all tracked processes.
   */
  list(): ManagedProcess[] {
    return [...this.processes.values()].map((e) => e.info);
  }

  /**
   * Number of currently running processes.
   */
  get runningCount(): number {
    let count = 0;
    for (const [, entry] of this.processes) {
      if (entry.info.status === 'running') count++;
    }
    return count;
  }

  /**
   * Total number of tracked processes (including completed).
   */
  get totalCount(): number {
    return this.processes.size;
  }

  /**
   * Remove completed/failed/killed processes from tracking.
   */
  prune(): number {
    let removed = 0;
    for (const [id, entry] of this.processes) {
      if (entry.info.status !== 'running') {
        this.processes.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
