import type { FileEntry, SymbolInfo, ImportInfo, ScannerConfig } from './types.js';
import { scanRepository } from './scanner.js';
import { FileRegistry } from './file-registry.js';
import { extractSymbols, extractImports, isAnalyzable } from './symbol-extractor.js';
import { DependencyGraph, buildDependencyGraph } from './dependency-graph.js';
import { readFile } from 'node:fs/promises';

/**
 * The repository index — the main data structure for Repo Intelligence.
 *
 * Combines file registry, symbol table, and dependency graph
 * with incremental indexing support.
 */
export class RepoIndex {
  public readonly registry: FileRegistry;
  public readonly symbols: Map<string, SymbolInfo[]>;
  public readonly imports: Map<string, ImportInfo[]>;
  public graph: DependencyGraph;

  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.registry = new FileRegistry();
    this.symbols = new Map();
    this.imports = new Map();
    this.graph = new DependencyGraph();
  }

  /**
   * Perform a full index of the repository.
   *
   * Scans all files, extracts symbols and imports, builds the dependency graph.
   */
  async fullIndex(config?: Partial<ScannerConfig>): Promise<IndexResult> {
    const scanConfig: ScannerConfig = {
      rootDir: this.rootDir,
      ...config,
    };

    const entries = await scanRepository(scanConfig);
    const changed = this.registry.load(entries);

    // Extract symbols and imports for all analyzable files
    let symbolCount = 0;
    let importCount = 0;

    for (const entry of entries) {
      if (entry.isBinary || !isAnalyzable(entry.language)) continue;

      try {
        const content = await readFile(entry.path, 'utf-8');
        const fileSymbols = extractSymbols(content, entry.relativePath);
        const fileImports = extractImports(content, entry.relativePath);

        this.symbols.set(entry.relativePath, fileSymbols);
        this.imports.set(entry.relativePath, fileImports);

        symbolCount += fileSymbols.length;
        importCount += fileImports.length;
      } catch {
        // Skip files that can't be read/parsed
      }
    }

    // Build dependency graph
    const allPaths = new Set(entries.map((e) => e.relativePath));
    this.graph = buildDependencyGraph(
      this.imports,
      (path) => allPaths.has(path),
    );

    return {
      totalFiles: entries.length,
      analyzedFiles: this.symbols.size,
      totalSymbols: symbolCount,
      totalImports: importCount,
      changedFiles: changed.size,
    };
  }

  /**
   * Perform an incremental index — only re-process changed files.
   *
   * Compares a fresh scan against the current registry and re-extracts
   * symbols/imports only for files whose content hash changed.
   */
  async incrementalIndex(config?: Partial<ScannerConfig>): Promise<IndexResult> {
    const scanConfig: ScannerConfig = {
      rootDir: this.rootDir,
      ...config,
    };

    const entries = await scanRepository(scanConfig);
    const changed = this.registry.load(entries);

    if (changed.size === 0) {
      return {
        totalFiles: entries.length,
        analyzedFiles: 0,
        totalSymbols: 0,
        totalImports: 0,
        changedFiles: 0,
      };
    }

    let symbolCount = 0;
    let importCount = 0;

    for (const relativePath of changed) {
      const entry = this.registry.get(relativePath);
      if (!entry) {
        // File was deleted — clean up
        this.symbols.delete(relativePath);
        this.imports.delete(relativePath);
        this.graph.removeFile(relativePath);
        continue;
      }

      if (entry.isBinary || !isAnalyzable(entry.language)) {
        this.symbols.delete(relativePath);
        this.imports.delete(relativePath);
        continue;
      }

      try {
        const content = await readFile(entry.path, 'utf-8');
        const fileSymbols = extractSymbols(content, entry.relativePath);
        const fileImports = extractImports(content, entry.relativePath);

        this.symbols.set(entry.relativePath, fileSymbols);
        this.imports.set(entry.relativePath, fileImports);

        symbolCount += fileSymbols.length;
        importCount += fileImports.length;
      } catch {
        this.symbols.delete(relativePath);
        this.imports.delete(relativePath);
      }
    }

    // Rebuild the full graph (incremental graph updates are complex;
    // full rebuild is cheap for typical repo sizes)
    const allPaths = new Set(this.registry.all().map((e) => e.relativePath));
    this.graph = buildDependencyGraph(
      this.imports,
      (path) => allPaths.has(path),
    );

    return {
      totalFiles: entries.length,
      analyzedFiles: changed.size,
      totalSymbols: symbolCount,
      totalImports: importCount,
      changedFiles: changed.size,
    };
  }
}

/**
 * Result of an indexing operation.
 */
export interface IndexResult {
  totalFiles: number;
  analyzedFiles: number;
  totalSymbols: number;
  totalImports: number;
  changedFiles: number;
}
