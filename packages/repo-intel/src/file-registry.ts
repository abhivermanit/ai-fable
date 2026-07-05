import type { FileEntry, Language } from './types.js';

/**
 * Tracks all known files in the repository with their metadata.
 *
 * Supports change detection by comparing content hashes.
 */
export class FileRegistry {
  private entries = new Map<string, FileEntry>();

  /**
   * Register or update a file entry.
   * Returns true if the file is new or has changed.
   */
  set(entry: FileEntry): boolean {
    const existing = this.entries.get(entry.relativePath);
    const changed = !existing || existing.hash !== entry.hash;
    this.entries.set(entry.relativePath, entry);
    return changed;
  }

  /**
   * Get a file entry by relative path.
   */
  get(relativePath: string): FileEntry | undefined {
    return this.entries.get(relativePath);
  }

  /**
   * Check if a file exists in the registry.
   */
  has(relativePath: string): boolean {
    return this.entries.has(relativePath);
  }

  /**
   * Remove a file from the registry.
   */
  delete(relativePath: string): boolean {
    return this.entries.delete(relativePath);
  }

  /**
   * Get all registered file entries.
   */
  all(): FileEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Get files filtered by language.
   */
  byLanguage(language: Language): FileEntry[] {
    return this.all().filter((e) => e.language === language);
  }

  /**
   * Get files matching a glob-like pattern on relativePath.
   */
  byPattern(pattern: RegExp): FileEntry[] {
    return this.all().filter((e) => pattern.test(e.relativePath));
  }

  /**
   * Number of tracked files.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Bulk-load entries from a scan result.
   * Returns the set of relative paths that are new or changed.
   */
  load(entries: FileEntry[]): Set<string> {
    const changed = new Set<string>();
    const newPaths = new Set(entries.map((e) => e.relativePath));

    for (const entry of entries) {
      if (this.set(entry)) {
        changed.add(entry.relativePath);
      }
    }

    // Detect deleted files
    for (const existing of this.entries.keys()) {
      if (!newPaths.has(existing)) {
        this.entries.delete(existing);
        changed.add(existing);
      }
    }

    return changed;
  }

  /**
   * Serialize the registry for persistence.
   */
  toJSON(): FileEntry[] {
    return this.all();
  }

  /**
   * Restore from serialized data.
   */
  static fromJSON(data: FileEntry[]): FileRegistry {
    const registry = new FileRegistry();
    for (const entry of data) {
      registry.entries.set(entry.relativePath, entry);
    }
    return registry;
  }
}
