import type { FileEntry, SymbolInfo, ImportInfo, ScannerConfig } from './types.js';
import type { SymbolKind } from './types.js';
import { scanRepository } from './scanner.js';
import { FileRegistry } from './file-registry.js';
import type { SymbolExtractor } from './symbol-extractor.js';
import { RegexSymbolExtractor, isAnalyzable } from './symbol-extractor.js';
import { DependencyGraph, buildDependencyGraph } from './dependency-graph.js';
import { readFile } from 'node:fs/promises';

/**
 * The repository index — the main data structure for Repo Intelligence.
 *
 * Combines file registry, symbol table, dependency graph, and
 * lookup indexes with incremental indexing support.
 */
export class RepoIndex {
  public readonly registry: FileRegistry;
  public readonly symbols: Map<string, SymbolInfo[]>;
  public readonly imports: Map<string, ImportInfo[]>;
  public graph: DependencyGraph;

  /** Index: symbol name → list of definitions (built during indexing) */
  public readonly symbolsByName: Map<string, SymbolInfo[]>;
  /** Index: symbol kind → list of symbols (built during indexing) */
  public readonly symbolsByKind: Map<SymbolKind, SymbolInfo[]>;

  /** Tracks which files changed in the last indexing operation */
  private lastChangedFiles: Set<string> = new Set();

  private rootDir: string;
  private extractor: SymbolExtractor;

  constructor(rootDir: string, extractor?: SymbolExtractor) {
    this.rootDir = rootDir;
    this.extractor = extractor ?? new RegexSymbolExtractor();
    this.registry = new FileRegistry();
    this.symbols = new Map();
    this.imports = new Map();
    this.graph = new DependencyGraph();
    this.symbolsByName = new Map();
    this.symbolsByKind = new Map();
  }

  /**
   * Perform a full index of the repository.
   *
   * Scans all files, extracts symbols and imports, builds the dependency graph
   * and lookup indexes.
   */
  async fullIndex(config?: Partial<ScannerConfig>): Promise<IndexResult> {
    const scanConfig: ScannerConfig = {
      rootDir: this.rootDir,
      ...config,
    };

    const entries = await scanRepository(scanConfig);
    const changed = this.registry.load(entries);
    this.lastChangedFiles = changed;

    // Clear previous indexes
    this.symbols.clear();
    this.imports.clear();
    this.symbolsByName.clear();
    this.symbolsByKind.clear();

    // Extract symbols and imports for all analyzable files
    let symbolCount = 0;
    let importCount = 0;
    let analyzedFiles = 0;

    for (const entry of entries) {
      if (entry.isBinary || !isAnalyzable(entry.language)) continue;

      try {
        const content = await readFile(entry.path, 'utf-8');
        const fileSymbols = this.extractor.extractSymbols(content, entry.relativePath);
        const fileImports = this.extractor.extractImports(content, entry.relativePath);

        this.symbols.set(entry.relativePath, fileSymbols);
        this.imports.set(entry.relativePath, fileImports);

        symbolCount += fileSymbols.length;
        importCount += fileImports.length;
        analyzedFiles++;
      } catch {
        // TODO: Use Logger service to report file read/parse failures
      }
    }

    // Build lookup indexes
    this.rebuildSymbolIndexes();

    // Build dependency graph
    const allPaths = new Set(entries.map((e) => e.relativePath));
    this.graph = buildDependencyGraph(
      this.imports,
      (path) => allPaths.has(path),
    );

    return {
      totalFiles: entries.length,
      analyzedFiles,
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
    this.lastChangedFiles = changed;

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
    let analyzedFiles = 0;

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
        const fileSymbols = this.extractor.extractSymbols(content, entry.relativePath);
        const fileImports = this.extractor.extractImports(content, entry.relativePath);

        this.symbols.set(entry.relativePath, fileSymbols);
        this.imports.set(entry.relativePath, fileImports);

        symbolCount += fileSymbols.length;
        importCount += fileImports.length;
        analyzedFiles++;
      } catch {
        // TODO: Use Logger service to report file read/parse failures
        this.symbols.delete(relativePath);
        this.imports.delete(relativePath);
      }
    }

    // Rebuild lookup indexes (cheap — just iterates the symbol maps)
    this.rebuildSymbolIndexes();

    // Rebuild the full graph (incremental graph updates are complex;
    // full rebuild is cheap for typical repo sizes)
    const allPaths = new Set(this.registry.all().map((e) => e.relativePath));
    this.graph = buildDependencyGraph(
      this.imports,
      (path) => allPaths.has(path),
    );

    return {
      totalFiles: entries.length,
      analyzedFiles,
      totalSymbols: symbolCount,
      totalImports: importCount,
      changedFiles: changed.size,
    };
  }

  /**
   * Get files that changed in the last indexing operation.
   */
  getLastChangedFiles(): string[] {
    return [...this.lastChangedFiles];
  }

  /**
   * Rebuild the name and kind indexes from the current symbol maps.
   */
  private rebuildSymbolIndexes(): void {
    this.symbolsByName.clear();
    this.symbolsByKind.clear();

    for (const [, fileSymbols] of this.symbols) {
      for (const symbol of fileSymbols) {
        // Name index
        const byName = this.symbolsByName.get(symbol.name);
        if (byName) {
          byName.push(symbol);
        } else {
          this.symbolsByName.set(symbol.name, [symbol]);
        }

        // Kind index
        const byKind = this.symbolsByKind.get(symbol.kind);
        if (byKind) {
          byKind.push(symbol);
        } else {
          this.symbolsByKind.set(symbol.kind, [symbol]);
        }
      }
    }
  }
}

/**
 * Result of an indexing operation.
 */
export interface IndexResult {
  totalFiles: number;
  /** Number of source files that were actually parsed for symbols */
  analyzedFiles: number;
  totalSymbols: number;
  totalImports: number;
  changedFiles: number;
}
