// Types
export {
  Language,
  SymbolKind,
} from './types.js';

export type {
  FileEntry,
  SymbolInfo,
  ImportInfo,
  DependencyEdge,
  ImpactResult,
  ScannerConfig,
  SearchResult,
} from './types.js';

// Scanner
export {
  scanRepository,
  detectLanguage,
  isBinaryFile,
  hashContent,
} from './scanner.js';

// File Registry
export { FileRegistry } from './file-registry.js';

// Symbol Extraction
export type { SymbolExtractor } from './symbol-extractor.js';
export {
  RegexSymbolExtractor,
  extractSymbols,
  extractImports,
  extractSymbolsFromFile,
  extractImportsFromFile,
  isAnalyzable,
} from './symbol-extractor.js';

// Dependency Graph
export {
  DependencyGraph,
  buildDependencyGraph,
  resolveModulePath,
} from './dependency-graph.js';

// Indexer
export { RepoIndex } from './indexer.js';
export type { IndexResult } from './indexer.js';

// Search API
export { SearchAPI } from './search.js';
export type { RepoStats } from './search.js';
