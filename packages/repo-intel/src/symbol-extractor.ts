import { readFile } from 'node:fs/promises';
import type { SymbolInfo, ImportInfo } from './types.js';
import { SymbolKind, Language } from './types.js';

/**
 * Regex patterns for extracting TypeScript/JavaScript symbols.
 *
 * These are intentionally simple. They cover the common patterns
 * found in a TypeScript codebase without requiring a full parser.
 * For complex cases (nested destructuring, multi-line signatures),
 * a proper AST parser (ts-morph) can replace this in the future.
 */
const PATTERNS = {
  // export function name(
  exportedFunction: /^export\s+(?:async\s+)?function\s*\*?\s+(\w+)/,
  // export default function name(
  exportedDefaultFunction: /^export\s+default\s+(?:async\s+)?function\s*\*?\s+(\w+)/,
  // function name(
  localFunction: /^(?:async\s+)?function\s*\*?\s+(\w+)/,
  // export const/let/var name =
  exportedVariable: /^export\s+(?:const|let|var)\s+(\w+)/,
  // const/let/var name =
  localVariable: /^(?:const|let|var)\s+(\w+)\s*(?::\s*\S+)?\s*=/,
  // export class Name
  exportedClass: /^export\s+(?:abstract\s+)?class\s+(\w+)/,
  // export default class Name
  exportedDefaultClass: /^export\s+default\s+(?:abstract\s+)?class\s+(\w+)/,
  // class Name
  localClass: /^(?:abstract\s+)?class\s+(\w+)/,
  // export interface Name
  exportedInterface: /^export\s+interface\s+(\w+)/,
  // interface Name
  localInterface: /^interface\s+(\w+)/,
  // export type Name =
  exportedTypeAlias: /^export\s+type\s+(\w+)\s*[=<{]/,
  // type Name =
  localTypeAlias: /^type\s+(\w+)\s*[=<{]/,
  // export enum Name
  exportedEnum: /^export\s+enum\s+(\w+)/,
  // enum Name
  localEnum: /^enum\s+(\w+)/,
  // export namespace Name
  exportedNamespace: /^export\s+namespace\s+(\w+)/,
  // namespace Name
  localNamespace: /^namespace\s+(\w+)/,
  // import ... from '...'
  importStatement: /^import\s+(?:type\s+)?(.+?)\s+from\s+['"](.+?)['"]/,
  // import '...'  (side-effect import)
  sideEffectImport: /^import\s+['"](.+?)['"]/,
  // export ... from '...' (re-export)
  reExport: /^export\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"](.+?)['"]/,
};

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
    // Local functions
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
        importedNames: [], // Could parse but re-exports vary in form
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
 * e.g., "{ foo, bar as baz }" → ['foo', 'bar']
 * e.g., "* as ns" → ['*']
 * e.g., "Default" → ['default']
 */
function parseImportNames(clause: string): string[] {
  const trimmed = clause.trim();

  // Namespace import: * as name
  if (trimmed.startsWith('*')) return ['*'];

  // Named imports: { name1, name2 }
  const braceMatch = trimmed.match(/\{([^}]+)\}/);
  if (braceMatch) {
    const names: string[] = [];
    for (const part of braceMatch[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '').trim();
      if (name) names.push(name);
    }
    // Also check for default import before braces
    const beforeBrace = trimmed.slice(0, trimmed.indexOf('{')).replace(',', '').trim();
    if (beforeBrace) names.unshift('default');
    return names;
  }

  // Default import only
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
