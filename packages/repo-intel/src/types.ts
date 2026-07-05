/**
 * Supported programming languages for analysis.
 */
export enum Language {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  JSON = 'json',
  Markdown = 'markdown',
  YAML = 'yaml',
  CSS = 'css',
  HTML = 'html',
  Shell = 'shell',
  Unknown = 'unknown',
}

/**
 * Metadata about a single file in the repository.
 */
export interface FileEntry {
  /** Absolute path to the file */
  path: string;
  /** Path relative to the repository root */
  relativePath: string;
  /** Detected language */
  language: Language;
  /** File size in bytes */
  size: number;
  /** SHA-256 content hash for change detection */
  hash: string;
  /** Last modified timestamp (ISO string) */
  lastModified: string;
  /** Whether this file is binary */
  isBinary: boolean;
}

/**
 * Types of symbols that can be extracted.
 */
export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  TypeAlias = 'type-alias',
  Enum = 'enum',
  Variable = 'variable',
  Namespace = 'namespace',
}

/**
 * A symbol extracted from source code.
 */
export interface SymbolInfo {
  /** Symbol name */
  name: string;
  /** Type of symbol */
  kind: SymbolKind;
  /** File where the symbol is defined */
  filePath: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (0-based) */
  column: number;
  /** Whether the symbol is exported */
  exported: boolean;
  /** Whether the symbol is a default export */
  isDefault: boolean;
}

/**
 * An import statement extracted from source code.
 */
export interface ImportInfo {
  /** The file that contains this import */
  sourceFile: string;
  /** The module specifier (e.g., './state-machine.js', '@ai-fable/core') */
  moduleSpecifier: string;
  /** Resolved absolute path (if resolvable within the repo) */
  resolvedPath?: string;
  /** Whether this is a package import (not a relative path) */
  isPackageImport: boolean;
  /** Imported names (empty for namespace/default-only imports) */
  importedNames: string[];
  /** Line number of the import */
  line: number;
}

/**
 * An edge in the dependency graph.
 */
export interface DependencyEdge {
  /** File that imports */
  from: string;
  /** File or package being imported */
  to: string;
  /** Specific names imported */
  importedNames: string[];
}

/**
 * Result of an impact analysis query.
 */
export interface ImpactResult {
  /** The file or symbol queried */
  target: string;
  /** Files that directly depend on the target */
  directDependents: string[];
  /** Files that transitively depend on the target */
  transitiveDependents: string[];
  /** Total number of affected files */
  affectedCount: number;
}

/**
 * Configuration for the repository scanner.
 */
export interface ScannerConfig {
  /** Root directory to scan */
  rootDir: string;
  /** Additional patterns to ignore (beyond .gitignore) */
  ignorePatterns?: string[];
  /** File size limit in bytes (skip larger files) */
  maxFileSize?: number;
}

/**
 * A search result from the search API.
 */
export interface SearchResult {
  /** Type of match */
  type: 'symbol' | 'file' | 'reference' | 'text';
  /** The matched item's path */
  filePath: string;
  /** Symbol info (if type is 'symbol') */
  symbol?: SymbolInfo;
  /** Import info (if type is 'reference') */
  reference?: ImportInfo;
  /** Line number of match */
  line?: number;
  /** Match context (surrounding text) */
  context?: string;
}
