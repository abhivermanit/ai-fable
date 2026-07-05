import { readFile } from 'node:fs/promises';
import type { SymbolInfo, ImportInfo } from './types.js';
import { SymbolKind, Language } from './types.js';

/**
 * Interface for symbol extraction strategies.
 *
 * The current implementation uses regex-based extraction. Future implementations
 * can use Tree-sitter or the TypeScript compiler API for full AST analysis.
 * Swap the implementation without changing the indexer or search layers.
 */
export interface SymbolExtractor {
  /**
   * Extract symbol definitions from source code content.
   */
  extractSymbols(content: string, filePath: string): SymbolInfo[];

  /**
   * Extract import/export statements from source code content.
   */
  extractImports(content: string, filePath: string): ImportInfo[];
}

/**
 * Regex patterns for extracting TypeScript/JavaScript symbols.
 *
 * Limitations of this approach:
 * - Does not handle multi-line declarations
 * - Does not resolve re-exported symbols to their original definition
 * - Does not support tsconfig path aliases
 * - Cannot detect symbols inside decorators or computed property names
 * - May miss arrow-function class properties (e.g., `filter = (x) => x`)
 *
 * A proper AST-based implementation (Tree-sitter or ts-morph) should
 * replace this once the project needs deeper semantic analysis.
 */
const PATTERNS = {
  exportedFunction: /^export\s+(?:async\s+)?function\s*\*?\s+(\w+)/,
  exportedDefaultFunction: /^export\s+default\s+(?:async\s+)?function\s*\*?\s+(\w+)/,
  localFunction: /^(?:async\s+)?function\s*\*?\s+(\w+)/,
  exportedVariable: /^export\s+(?:const|let|var)\s+(\w+)/,
  localVariable: /^(?:const|let|var)\s+(\w+)\s*(?::\s*\S+)?\s*=/,
  exportedClass: /^export\s+(?:abstract\s+)?class\s+(\w+)/,
  exportedDefaultClass: /^export\s+default\s+(?:abstract\s+)?class\s+(\w+)/,
  localClass: /^(?:abstract\s+)?class\s+(\w+)/,
  exportedInterface: /^export\s+interface\s+(\w+)/,
  localInterface: /^interface\s+(\w+)/,
  exportedTypeAlias: /^export\s+type\s+(\w+)\s*[=<{]/,
  localTypeAlias: /^type\s+(\w+)\s*[=<{]/,
  exportedEnum: /^export\s+enum\s+(\w+)/,
  localEnum: /^enum\s+(\w+)/,
  exportedNamespace: /^export\s+namespace\s+(\w+)/,
  localNamespace: /^namespace\s+(\w+)/,
  importStatement: /^import\s+(?:type\s+)?(.+?)\s+from\s+['"](.+?)['"]/,
  sideEffectImport: /^import\s+['"](.+?)['"]/,
  reExport: /^export\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"](.+?)['"]/,
};

/**
 * Regex-based symbol extractor for TypeScript/JavaScript.
 *
 * Implements the SymbolExtractor interface using line-by-line regex matching.
 * Suitable for fast, approximate analysis of typical TS/JS codebases.
 */
export class RegexSymbolExtractor implements SymbolExtractor {
  extractSymbols(content: string, filePath: string): SymbolInfo[] {
    return extractSymbols(content, filePath);
  }

  extractImports(content: string, filePath: string): ImportInfo[] {
    return extractImports(content, filePath);
  }
}

/**
 * Extract symbols from a TypeScript/JavaScript source file.
 */
export function extractSymbols(content: string, filePath: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimStart();
    const lineNum = i + 1;

    // Exported functions
    let match = line.match(PATTERNS.exportedDefaultFunction);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Function, filePath, line: lineNum, column: 0, exported: true, isDefault: true });
      continue;
    }
    match = line.match(PATTERNS.exportedFunction);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Function, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
    match = line.match(PATTERNS.localFunction);
    if (match && !line.startsWith('export')) {
      symbols.push({ name: match[1], kind: SymbolKind.Function, filePath, line: lineNum, column: 0, exported: false, isDefault: false });
      continue;
    }

    // Classes
    match = line.match(PATTERNS.exportedDefaultClass);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Class, filePath, line: lineNum, column: 0, exported: true, isDefault: true });
      continue;
    }
    match = line.match(PATTERNS.exportedClass);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Class, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
    match = line.match(PATTERNS.localClass);
    if (match && !line.startsWith('export')) {
      symbols.push({ name: match[1], kind: SymbolKind.Class, filePath, line: lineNum, column: 0, exported: false, isDefault: false });
      continue;
    }

    // Interfaces
    match = line.match(PATTERNS.exportedInterface);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Interface, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
    match = line.match(PATTERNS.localInterface);
    if (match && !line.startsWith('export')) {
      symbols.push({ name: match[1], kind: SymbolKind.Interface, filePath, line: lineNum, column: 0, exported: false, isDefault: false });
      continue;
    }

    // Type aliases
    match = line.match(PATTERNS.exportedTypeAlias);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.TypeAlias, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
    match = line.match(PATTERNS.localTypeAlias);
    if (match && !line.startsWith('export')) {
      symbols.push({ name: match[1], kind: SymbolKind.TypeAlias, filePath, line: lineNum, column: 0, exported: false, isDefault: false });
      continue;
    }

    // Enums
    match = line.match(PATTERNS.exportedEnum);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Enum, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
    match = line.match(PATTERNS.localEnum);
    if (match && !line.startsWith('export')) {
      symbols.push({ name: match[1], kind: SymbolKind.Enum, filePath, line: lineNum, column: 0, exported: false, isDefault: false });
      continue;
    }

    // Namespaces
    match = line.match(PATTERNS.exportedNamespace);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Namespace, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
    match = line.match(PATTERNS.localNamespace);
    if (match && !line.startsWith('export')) {
      symbols.push({ name: match[1], kind: SymbolKind.Namespace, filePath, line: lineNum, column: 0, exported: false, isDefault: false });
      continue;
    }

    // Exported variables (arrow functions, constants)
    match = line.match(PATTERNS.exportedVariable);
    if (match) {
      symbols.push({ name: match[1], kind: SymbolKind.Variable, filePath, line: lineNum, column: 0, exported: true, isDefault: false });
      continue;
    }
  }

  return symbols;
}

/**
 * Extract import statements from a TypeScript/JavaScript source file.
 */
export function extractImports(content: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimStart();
    const lineNum = i + 1;

    // Re-exports count as imports for dependency analysis
    let match = line.match(PATTERNS.reExport);
    if (match) {
      const specifier = match[1];
      imports.push({
        sourceFile: filePath,
        moduleSpecifier: specifier,
        isPackageImport: !specifier.startsWith('.') && !specifier.startsWith('/'),
        importedNames: [],
        line: lineNum,
      });
      continue;
    }

    // Side-effect imports
    match = line.match(PATTERNS.sideEffectImport);
    if (match && !line.match(PATTERNS.importStatement)) {
      imports.push({
        sourceFile: filePath,
        moduleSpecifier: match[1],
        isPackageImport: !match[1].startsWith('.') && !match[1].startsWith('/'),
        importedNames: [],
        line: lineNum,
      });
      continue;
    }

    // Standard imports
    match = line.match(PATTERNS.importStatement);
    if (match) {
      const importClause = match[1];
      const specifier = match[2];
      const names = parseImportNames(importClause);

      imports.push({
        sourceFile: filePath,
        moduleSpecifier: specifier,
        isPackageImport: !specifier.startsWith('.') && !specifier.startsWith('/'),
        importedNames: names,
        line: lineNum,
      });
    }
  }

  return imports;
}

/**
 * Parse imported names from an import clause.
 */
function parseImportNames(clause: string): string[] {
  const trimmed = clause.trim();

  if (trimmed.startsWith('*')) return ['*'];

  const braceMatch = trimmed.match(/\{([^}]+)\}/);
  if (braceMatch) {
    const names: string[] = [];
    for (const part of braceMatch[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '').trim();
      if (name) names.push(name);
    }
    const beforeBrace = trimmed.slice(0, trimmed.indexOf('{')).replace(',', '').trim();
    if (beforeBrace) names.unshift('default');
    return names;
  }

  if (trimmed && !trimmed.startsWith('{')) return ['default'];

  return [];
}

/**
 * Extract symbols from a file on disk.
 */
export async function extractSymbolsFromFile(filePath: string): Promise<SymbolInfo[]> {
  const content = await readFile(filePath, 'utf-8');
  return extractSymbols(content, filePath);
}

/**
 * Extract imports from a file on disk.
 */
export async function extractImportsFromFile(filePath: string): Promise<ImportInfo[]> {
  const content = await readFile(filePath, 'utf-8');
  return extractImports(content, filePath);
}

/**
 * Check if a file should be analyzed for symbols (source code file).
 */
export function isAnalyzable(language: Language): boolean {
  return language === Language.TypeScript || language === Language.JavaScript;
}
