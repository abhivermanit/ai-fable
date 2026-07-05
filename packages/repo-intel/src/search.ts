import type { SymbolInfo, ImportInfo, SearchResult, ImpactResult } from './types.js';
import type { RepoIndex } from './indexer.js';

/**
 * Search API for querying the repository index.
 *
 * Provides symbol lookup, path lookup, reference lookup, and text search
 * without requiring an LLM.
 */
export class SearchAPI {
  constructor(private readonly index: RepoIndex) {}

  /**
   * Find where a symbol is defined.
   *
   * Example: "Where is TaskStatus defined?"
   */
  findSymbol(name: string): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [filePath, symbols] of this.index.symbols) {
      for (const symbol of symbols) {
        if (symbol.name === name) {
          results.push({
            type: 'symbol',
            filePath,
            symbol,
            line: symbol.line,
          });
        }
      }
    }

    return results;
  }

  /**
   * Find symbols matching a pattern (case-insensitive partial match).
   */
  searchSymbols(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [filePath, symbols] of this.index.symbols) {
      for (const symbol of symbols) {
        if (symbol.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'symbol',
            filePath,
            symbol,
            line: symbol.line,
          });
        }
      }
    }

    return results;
  }

  /**
   * Find files that import a given file.
   *
   * Example: "Which files import orchestrator.ts?"
   */
  findReferences(targetPath: string): SearchResult[] {
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    // Primary: use dependency graph reverse edges
    const dependents = this.index.graph.dependentsOf(targetPath);
    for (const dep of dependents) {
      if (!seen.has(dep)) {
        seen.add(dep);
        // Find the specific import line
        const fileImports = this.index.imports.get(dep);
        const matchingImport = fileImports?.find((imp) => imp.resolvedPath === targetPath);
        results.push({
          type: 'reference',
          filePath: dep,
          reference: matchingImport,
          line: matchingImport?.line,
        });
      }
    }

    // Fallback: search import specifiers for partial path match
    for (const [filePath, fileImports] of this.index.imports) {
      if (seen.has(filePath)) continue;
      for (const imp of fileImports) {
        // Match if specifier contains the target filename (without extension)
        const targetBase = targetPath.replace(/\.[^.]+$/, '').split('/').pop() ?? '';
        if (targetBase && imp.moduleSpecifier.includes(targetBase)) {
          seen.add(filePath);
          results.push({
            type: 'reference',
            filePath,
            reference: imp,
            line: imp.line,
          });
          break;
        }
      }
    }

    return results;
  }

  /**
   * Find all files that depend on a package.
   *
   * Example: "What depends on @ai-fable/core?"
   */
  findPackageDependents(packageName: string): SearchResult[] {
    const dependents = this.index.graph.dependentsOfPackage(packageName);
    return dependents.map((filePath) => ({
      type: 'reference' as const,
      filePath,
    }));
  }

  /**
   * Find files matching a path pattern.
   *
   * Example: "Find all test files"
   */
  findFiles(pattern: string | RegExp): SearchResult[] {
    const regex = typeof pattern === 'string'
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'), 'i')
      : pattern;

    return this.index.registry
      .byPattern(regex)
      .map((entry) => ({
        type: 'file' as const,
        filePath: entry.relativePath,
      }));
  }

  /**
   * Get impact analysis — what would be affected if a file changes.
   *
   * Example: "What is affected if I change @ai-fable/core?"
   */
  impact(filePath: string): ImpactResult {
    return this.index.graph.impact(filePath);
  }

  /**
   * Get all exported symbols across the repository.
   */
  allExports(): SymbolInfo[] {
    const results: SymbolInfo[] = [];
    for (const [, symbols] of this.index.symbols) {
      for (const symbol of symbols) {
        if (symbol.exported) results.push(symbol);
      }
    }
    return results;
  }

  /**
   * Get files that changed since last index (from registry change detection).
   */
  changedFiles(): string[] {
    // This is tracked during indexing; expose the registry for comparison
    return [];
  }

  /**
   * Get summary statistics about the indexed repository.
   */
  stats(): RepoStats {
    let totalSymbols = 0;
    let totalImports = 0;
    for (const [, symbols] of this.index.symbols) {
      totalSymbols += symbols.length;
    }
    for (const [, imports] of this.index.imports) {
      totalImports += imports.length;
    }

    return {
      totalFiles: this.index.registry.size,
      analyzedFiles: this.index.symbols.size,
      totalSymbols,
      totalImports,
      graphNodes: this.index.graph.fileCount,
      graphEdges: this.index.graph.edgeCount,
    };
  }
}

/**
 * Summary statistics about the repository index.
 */
export interface RepoStats {
  totalFiles: number;
  analyzedFiles: number;
  totalSymbols: number;
  totalImports: number;
  graphNodes: number;
  graphEdges: number;
}
