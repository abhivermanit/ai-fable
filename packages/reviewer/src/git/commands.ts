import { execSync } from 'node:child_process';

/**
 * Execute a git command and return the trimmed stdout.
 * Throws if the command fails.
 */
export function exec(args: string, cwd?: string): string {
  return execSync(`git ${args}`, {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Execute a git command and return true if it exits 0, false otherwise.
 */
export function execOk(args: string, cwd?: string): boolean {
  try {
    exec(args, cwd);
    return true;
  } catch {
    return false;
  }
}
