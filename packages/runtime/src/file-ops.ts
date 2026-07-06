import { readFile, writeFile, mkdir, rm, stat, access, readdir } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { constants } from 'node:fs';
import type { FileOperationResult, SandboxConfig } from './types.js';

/**
 * File operation service for the execution runtime.
 *
 * Provides read/write/delete with:
 * - Path validation (within sandbox boundaries)
 * - Protected path enforcement
 * - Auto-creation of parent directories
 */
export class FileOps {
  private readonly config: SandboxConfig;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  /**
   * Read a file's content as a string.
   */
  async read(filePath: string): Promise<string> {
    const resolved = this.resolvePath(filePath);
    this.assertReadable(resolved);
    return readFile(resolved, 'utf-8');
  }

  /**
   * Read a file's content as a Buffer.
   */
  async readBinary(filePath: string): Promise<Buffer> {
    const resolved = this.resolvePath(filePath);
    this.assertReadable(resolved);
    return readFile(resolved);
  }

  /**
   * Write content to a file, creating parent directories if needed.
   */
  async write(filePath: string, content: string): Promise<FileOperationResult> {
    const resolved = this.resolvePath(filePath);
    this.assertWritable(resolved);

    try {
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content, 'utf-8');
      return { success: true, path: resolved };
    } catch (err) {
      return {
        success: false,
        path: resolved,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Append content to a file.
   */
  async append(filePath: string, content: string): Promise<FileOperationResult> {
    const resolved = this.resolvePath(filePath);
    this.assertWritable(resolved);

    try {
      const existing = await this.safeRead(resolved);
      const newContent = existing ? existing + content : content;
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, newContent, 'utf-8');
      return { success: true, path: resolved };
    } catch (err) {
      return {
        success: false,
        path: resolved,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Apply a patch: replace `oldText` with `newText` in a file.
   *
   * TODO: Replace this simple string-replace approach with a richer
   * PatchOperation / TextEdit[] model (similar to LSP TextEdits) that
   * supports line-range replacements, multi-edit batches, and conflict
   * detection. Not needed until Milestone 5+ when verification needs
   * to reason about diffs.
   */
  async patch(filePath: string, oldText: string, newText: string): Promise<FileOperationResult> {
    const resolved = this.resolvePath(filePath);
    this.assertWritable(resolved);

    try {
      const content = await readFile(resolved, 'utf-8');
      if (!content.includes(oldText)) {
        return {
          success: false,
          path: resolved,
          error: 'Old text not found in file',
        };
      }
      const patched = content.replace(oldText, newText);
      await writeFile(resolved, patched, 'utf-8');
      return { success: true, path: resolved };
    } catch (err) {
      return {
        success: false,
        path: resolved,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Delete a file.
   */
  async delete(filePath: string): Promise<FileOperationResult> {
    const resolved = this.resolvePath(filePath);
    this.assertWritable(resolved);

    try {
      await rm(resolved);
      return { success: true, path: resolved };
    } catch (err) {
      return {
        success: false,
        path: resolved,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check if a file exists.
   */
  async exists(filePath: string): Promise<boolean> {
    const resolved = this.resolvePath(filePath);
    try {
      await access(resolved, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files in a directory.
   */
  async listDir(dirPath: string): Promise<string[]> {
    const resolved = this.resolvePath(dirPath);
    this.assertReadable(resolved);
    const entries = await readdir(resolved);
    return entries;
  }

  /**
   * Resolve a path relative to the sandbox cwd.
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/')) return filePath;
    return resolve(this.config.cwd, filePath);
  }

  /**
   * Assert that a path is within the sandbox boundaries for reading.
   */
  private assertReadable(resolved: string): void {
    // Must be within cwd
    const rel = relative(this.config.cwd, resolved);
    if (rel.startsWith('..')) {
      throw new FileAccessError(`Path is outside sandbox: ${resolved}`);
    }
  }

  /**
   * Assert that a path is writable (not protected, within boundaries).
   */
  private assertWritable(resolved: string): void {
    this.assertReadable(resolved);

    // Check protected paths
    for (const protectedPath of this.config.protectedPaths) {
      const resolvedProtected = resolve(this.config.cwd, protectedPath);
      if (resolved === resolvedProtected || resolved.startsWith(resolvedProtected + '/')) {
        throw new FileAccessError(`Path is protected: ${resolved}`);
      }
    }

    // Check allowed write paths (if specified)
    if (this.config.allowedWritePaths.length > 0) {
      const allowed = this.config.allowedWritePaths.some((allowedPath) => {
        const resolvedAllowed = resolve(this.config.cwd, allowedPath);
        return resolved === resolvedAllowed || resolved.startsWith(resolvedAllowed + '/');
      });
      if (!allowed) {
        throw new FileAccessError(`Path is not in allowed write paths: ${resolved}`);
      }
    }
  }

  /**
   * Safely read a file, returning undefined if it doesn't exist.
   */
  private async safeRead(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf-8');
    } catch {
      return undefined;
    }
  }
}

/**
 * Error thrown when a file access violation occurs.
 */
export class FileAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileAccessError';
  }
}
