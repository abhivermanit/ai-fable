import { describe, it, expect } from 'vitest';
import { exec, execOrThrow, ShellError } from './shell.js';

describe('shell executor', () => {
  describe('exec', () => {
    it('captures stdout', async () => {
      const result = await exec('echo "hello world"');
      expect(result.stdout.trim()).toBe('hello world');
      expect(result.exitCode).toBe(0);
    });

    it('captures stderr', async () => {
      const result = await exec('echo "error" >&2');
      expect(result.stderr.trim()).toBe('error');
    });

    it('returns non-zero exit code on failure', async () => {
      const result = await exec('exit 42');
      expect(result.exitCode).toBe(42);
      expect(result.timedOut).toBe(false);
      expect(result.aborted).toBe(false);
    });

    it('respects cwd option', async () => {
      const result = await exec('pwd', { cwd: '/tmp' });
      expect(result.stdout.trim()).toMatch(/\/tmp|\/private\/tmp/);
    });

    it('passes environment variables', async () => {
      const result = await exec('echo $MY_VAR', { env: { MY_VAR: 'test-value' } });
      expect(result.stdout.trim()).toBe('test-value');
    });

    it('kills process on timeout', async () => {
      const result = await exec('sleep 60', { timeoutMs: 50 });
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).not.toBe(0);
    });

    it('kills process on abort', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      const result = await exec('sleep 60', { signal: controller.signal });
      expect(result.aborted).toBe(true);
      expect(result.exitCode).not.toBe(0);
    });

    it('handles already-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await exec('echo "should not run"', { signal: controller.signal });
      expect(result.aborted).toBe(true);
    });

    it('tracks duration', async () => {
      const result = await exec('sleep 0.05');
      expect(result.durationMs).toBeGreaterThanOrEqual(30);
    });

    it('handles command not found', async () => {
      const result = await exec('nonexistent_command_xyz');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('execOrThrow', () => {
    it('returns result on success', async () => {
      const result = await execOrThrow('echo "ok"');
      expect(result.stdout.trim()).toBe('ok');
    });

    it('throws ShellError on failure', async () => {
      await expect(execOrThrow('exit 1')).rejects.toThrow(ShellError);
    });

    it('includes exit code in error', async () => {
      try {
        await execOrThrow('exit 7');
      } catch (e) {
        expect(e).toBeInstanceOf(ShellError);
        expect((e as ShellError).result.exitCode).toBe(7);
      }
    });

    it('throws on timeout', async () => {
      await expect(execOrThrow('sleep 60', { timeoutMs: 50 })).rejects.toThrow('timed out');
    });
  });
});
