import type { Executor } from './execution-api.js';
import type { ExecutionSession } from './execution-context.js';
import type { ShellResult, ShellOptions, FileOperationResult, ManagedProcess } from './types.js';

/**
 * Implements the Executor interface by delegating to an ExecutionSession.
 *
 * This is the bridge between the Orchestrator's worker abstraction
 * and the runtime's session infrastructure.
 */
export class SessionExecutor implements Executor {
  private readonly session: ExecutionSession;

  constructor(session: ExecutionSession) {
    this.session = session;
  }

  get cwd(): string {
    return this.session.context.cwd;
  }

  get disposed(): boolean {
    return this.session.context.disposed;
  }

  async exec(command: string, options?: ShellOptions): Promise<ShellResult> {
    return this.session.exec(command, options);
  }

  async execOrThrow(command: string, options?: ShellOptions): Promise<ShellResult> {
    return this.session.execOrThrow(command, options);
  }

  async readFile(path: string): Promise<string> {
    return this.session.files.read(path);
  }

  async writeFile(path: string, content: string): Promise<FileOperationResult> {
    return this.session.files.write(path, content);
  }

  async patchFile(path: string, oldText: string, newText: string): Promise<FileOperationResult> {
    return this.session.files.patch(path, oldText, newText);
  }

  async deleteFile(path: string): Promise<FileOperationResult> {
    return this.session.files.delete(path);
  }

  async fileExists(path: string): Promise<boolean> {
    return this.session.files.exists(path);
  }

  async listDir(path: string): Promise<string[]> {
    return this.session.files.listDir(path);
  }

  spawnProcess(command: string, options?: ShellOptions): ManagedProcess {
    return this.session.spawnProcess(command, options);
  }

  async gitCommit(message: string): Promise<ShellResult> {
    return this.session.gitCommit(message);
  }

  async gitStatus(): Promise<string> {
    return this.session.gitStatus();
  }

  async gitDiff(): Promise<string> {
    return this.session.gitDiff();
  }

  async dispose(): Promise<void> {
    return this.session.dispose();
  }
}
