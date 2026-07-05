# @ai-fable/repo-intel

Repository Intelligence — structural code analysis, symbol extraction, and dependency graph for AI Fable.

## Overview

This package provides the Repo Intelligence layer described in the frozen architecture. It enables the Task Orchestrator and future agents to query repository structure without involving an LLM.

## Architecture

```
Scanner → File Registry → Symbol Extractor → Dependency Graph → Search API
                              ↓
                        Symbol Indexes
```

## Capabilities

- **Repository scanning**: Walk the file tree respecting `.gitignore`, skip binaries and generated files
- **File registry**: Track files with SHA-256 content hashes, language detection, last modified timestamps
- **Symbol extraction**: Extract functions, classes, interfaces, enums, type aliases, namespaces, variables, imports/exports
- **Dependency graph**: Forward and reverse edges, package dependencies, transitive impact analysis
- **Incremental indexing**: Only re-process files whose content hash changed
- **Search API**: Symbol lookup, path lookup, reference lookup, impact analysis — all without an LLM

## Symbol Extraction Approach

The current implementation uses **regex-based line-by-line extraction** (`RegexSymbolExtractor`).

This is intentionally simple and covers the common patterns found in TypeScript/JavaScript codebases.

### Supported syntax

- `export function name()`
- `export async function name()`
- `export default function name()`
- `export class Name {}`
- `export abstract class Name {}`
- `export interface Name {}`
- `export type Name = ...`
- `export enum Name {}`
- `export namespace Name {}`
- `export const/let/var name = ...`
- `import { name } from '...'`
- `import type { name } from '...'`
- `import * as name from '...'`
- `export { ... } from '...'` (re-exports)

### Known limitations

- **No AST parsing yet** — multi-line declarations, decorators, and computed names are not detected
- **No tsconfig path aliases** — only relative and package imports are resolved
- **No arrow-function class properties** — `filter = (x) => x` in class bodies not detected
- **No nested destructuring** — `export const { a, b } = obj` not fully supported
- **Binary files are not hashed** — changes to binary files are not detected by incremental indexing (intentional; binaries are excluded from analysis)

### Extensibility

The `SymbolExtractor` interface allows swapping the regex implementation with a proper AST parser (Tree-sitter or ts-morph) in the future without changing the indexer, search, or dependency graph layers.

## Usage

```typescript
import { RepoIndex, SearchAPI } from '@ai-fable/repo-intel';

const index = new RepoIndex('/path/to/repo');
await index.fullIndex();

const search = new SearchAPI(index);

// Where is TaskStatus defined?
search.findSymbol('TaskStatus');

// Which files import orchestrator.ts?
search.findReferences('src/orchestrator.ts');

// What depends on @ai-fable/core?
search.findPackageDependents('@ai-fable/core');

// What changed since last index?
await index.incrementalIndex();
search.changedFiles();

// Impact analysis
search.impact('src/types.ts');
```

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm dev        # Watch mode
pnpm lint       # Run ESLint
pnpm typecheck  # Type check without emitting
pnpm test       # Run tests
pnpm clean      # Remove build artifacts
```
