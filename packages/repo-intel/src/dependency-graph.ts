import { normalize, dirname, join } from 'node:path';
import type { ImportInfo, DependencyEdge, ImpactResult } from './types.js';

/**
 * Resolves a module specifier to a file path within the repo.
 *
 * Handles:
 * - Relative imports with .js extension (ESM style)
 * - Relative imports without extension (tries .ts, .tsx, .js, /index.ts, /index.js)
 * - Returns undefined for package imports (handled separately)
 *
 * All paths are relative to the repository root.
 */
export function resolveModulePath(
  specifier: string,
  fromFile: string,
  fileExists: (path: string) => boolean,
): string | undefined {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return undefined; // Package import
  }

  const baseDir = dirname(fromFile);
  // Use posix-style join for relative paths
  const resolved = normalize(join(baseDir, specifier));

  // Try exact match (e.g., already has .js extension)
  if (fileExists(resolved)) return resolved;

  // .js → .ts (ESM convention in TypeScript projects)
  if (resolved.endsWith('.js')) {
    const tsPath = resolved.replace(/\.js$/, '.ts');
    if (fileExists(tsPath)) return tsPath;
    const tsxPath = resolved.replace(/\.js$/, '.tsx');
    if (fileExists(tsxPath)) return tsxPath;
  }

  // Try adding extensions
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  for (const ext of extensions) {
    if (fileExists(resolved + ext)) return resolved + ext;
  }

  // Try as directory with index
  const indexExtensions = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const idx of indexExtensions) {
    if (fileExists(resolved + idx)) return resolved + idx;
  }

  return undefined;
}

/**
 * Directed graph of file dependencies.
 *
 * Edges go from importer → imported (forward dependencies).
 * Supports reverse lookups (who imports X?).
 */
export class DependencyGraph {
  /** Forward edges: file → set of files it imports */
  private forward = new Map<string, Set<string>>();
  /** Reverse edges: file → set of files that import it */
  private reverse = new Map<string, Set<string>>();
  /** Package dependencies: file → set of packages it imports */
  private packageDeps = new Map<string, Set<string>>();
  /** Detailed edge info for querying imported names */
  private edges: DependencyEdge[] = [];

  /**
   * Add a dependency edge.
   */
  addEdge(edge: DependencyEdge): void {
    this.edges.push(edge);

    // Forward
    if (!this.forward.has(edge.from)) {
      this.forward.set(edge.from, new Set());
    }
    this.forward.get(edge.from)!.add(edge.to);

    // Reverse
    if (!this.reverse.has(edge.to)) {
      this.reverse.set(edge.to, new Set());
    }
    this.reverse.get(edge.to)!.add(edge.from);
  }

  /**
   * Record a package-level dependency.
   */
  addPackageDependency(file: string, packageName: string): void {
    if (!this.packageDeps.has(file)) {
      this.packageDeps.set(file, new Set());
    }
    this.packageDeps.get(file)!.add(packageName);
  }

  /**
   * Get direct dependencies of a file (what it imports).
   */
  dependenciesOf(file: string): string[] {
    return [...(this.forward.get(file) ?? [])];
  }

  /**
   * Get direct dependents of a file (who imports it).
   */
  dependentsOf(file: string): string[] {
    return [...(this.reverse.get(file) ?? [])];
  }

  /**
   * Get all files that depend on a given package.
   */
  dependentsOfPackage(packageName: string): string[] {
    const result: string[] = [];
    for (const [file, packages] of this.packageDeps) {
      if (packages.has(packageName)) {
        result.push(file);
      }
    }
    return result;
  }

  /**
   * Compute transitive dependents (impact analysis).
   * Returns all files that would be affected if the target changes.
   */
  impact(target: string): ImpactResult {
    const directDependents = this.dependentsOf(target);
    const transitiveDependents = new Set<string>();

    // BFS to find all transitive dependents
    const queue = [...directDependents];
    const visited = new Set<string>(queue);

    while (queue.length > 0) {
      const current = queue.shift()!;
      transitiveDependents.add(current);

      const nextDependents = this.dependentsOf(current);
      for (const dep of nextDependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }

    return {
      target,
      directDependents,
      transitiveDependents: [...transitiveDependents],
      affectedCount: transitiveDependents.size,
    };
  }

  /**
   * Get all edges from a specific file.
   */
  edgesFrom(file: string): DependencyEdge[] {
    return this.edges.filter((e) => e.from === file);
  }

  /**
   * Get all edges to a specific file.
   */
  edgesTo(file: string): DependencyEdge[] {
    return this.edges.filter((e) => e.to === file);
  }

  /**
   * Remove all edges associated with a file (for re-indexing).
   */
  removeFile(file: string): void {
    // Remove forward edges from this file
    const deps = this.forward.get(file);
    if (deps) {
      for (const dep of deps) {
        this.reverse.get(dep)?.delete(file);
      }
      this.forward.delete(file);
    }

    // Remove reverse edges to this file
    const importers = this.reverse.get(file);
    if (importers) {
      for (const importer of importers) {
        this.forward.get(importer)?.delete(file);
      }
      this.reverse.delete(file);
    }

    // Remove detailed edges
    this.edges = this.edges.filter((e) => e.from !== file && e.to !== file);

    // Remove package deps
    this.packageDeps.delete(file);
  }

  /**
   * Total number of files in the graph.
   */
  get fileCount(): number {
    const allFiles = new Set<string>();
    for (const [file, deps] of this.forward) {
      allFiles.add(file);
      for (const dep of deps) allFiles.add(dep);
    }
    return allFiles.size;
  }

  /**
   * Total number of edges.
   */
  get edgeCount(): number {
    return this.edges.length;
  }
}

/**
 * Build a dependency graph from import information.
 */
export function buildDependencyGraph(
  imports: Map<string, ImportInfo[]>,
  fileExists: (path: string) => boolean,
): DependencyGraph {
  const graph = new DependencyGraph();

  for (const [file, fileImports] of imports) {
    for (const imp of fileImports) {
      if (imp.isPackageImport) {
        graph.addPackageDependency(file, imp.moduleSpecifier);
      } else {
        const resolved = resolveModulePath(imp.moduleSpecifier, file, fileExists);
        if (resolved) {
          graph.addEdge({
            from: file,
            to: resolved,
            importedNames: imp.importedNames,
          });
        }
      }
    }
  }

  return graph;
}
