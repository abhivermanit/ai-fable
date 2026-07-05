import { describe, it, expect } from 'vitest';
import { extractSymbols, extractImports, isAnalyzable } from './symbol-extractor.js';
import { SymbolKind, Language } from './types.js';

describe('extractSymbols', () => {
  it('extracts exported function', () => {
    const code = `export function doStuff() {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      name: 'doStuff',
      kind: SymbolKind.Function,
      exported: true,
      isDefault: false,
      line: 1,
    });
  });

  it('extracts exported async function', () => {
    const code = `export async function fetchData() {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'fetchData', kind: SymbolKind.Function, exported: true });
  });

  it('extracts export default function', () => {
    const code = `export default function main() {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'main', kind: SymbolKind.Function, exported: true, isDefault: true });
  });

  it('extracts local function', () => {
    const code = `function helper() {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'helper', kind: SymbolKind.Function, exported: false });
  });

  it('extracts exported class', () => {
    const code = `export class TaskQueue {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'TaskQueue', kind: SymbolKind.Class, exported: true });
  });

  it('extracts abstract class', () => {
    const code = `export abstract class BaseWorker {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'BaseWorker', kind: SymbolKind.Class, exported: true });
  });

  it('extracts exported interface', () => {
    const code = `export interface Planner {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'Planner', kind: SymbolKind.Interface, exported: true });
  });

  it('extracts local interface', () => {
    const code = `interface InternalConfig {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'InternalConfig', kind: SymbolKind.Interface, exported: false });
  });

  it('extracts exported type alias', () => {
    const code = `export type OrchestratorResult = TaskResult;`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'OrchestratorResult', kind: SymbolKind.TypeAlias, exported: true });
  });

  it('extracts exported enum', () => {
    const code = `export enum TaskStatus { Pending = 'pending' }`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'TaskStatus', kind: SymbolKind.Enum, exported: true });
  });

  it('extracts exported variable (const)', () => {
    const code = `export const MAX_RETRIES = 3;`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'MAX_RETRIES', kind: SymbolKind.Variable, exported: true });
  });

  it('extracts exported namespace', () => {
    const code = `export namespace Utils {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'Utils', kind: SymbolKind.Namespace, exported: true });
  });

  it('extracts multiple symbols from a file', () => {
    const code = `
export interface Config {}
export class Service {}
export function create() {}
export const VERSION = '1.0';
function internal() {}
`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols).toHaveLength(5);
    expect(symbols.map((s) => s.name)).toEqual(['Config', 'Service', 'create', 'VERSION', 'internal']);
  });

  it('reports correct line numbers', () => {
    const code = `// comment\n\nexport function foo() {}\n\nexport class Bar {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0].line).toBe(3);
    expect(symbols[1].line).toBe(5);
  });

  it('handles generator functions', () => {
    const code = `export function* generate() {}`;
    const symbols = extractSymbols(code, 'test.ts');
    expect(symbols[0]).toMatchObject({ name: 'generate', kind: SymbolKind.Function });
  });
});

describe('extractImports', () => {
  it('extracts named import', () => {
    const code = `import { TaskStatus, TaskPriority } from '@ai-fable/core';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({
      moduleSpecifier: '@ai-fable/core',
      isPackageImport: true,
      importedNames: ['TaskStatus', 'TaskPriority'],
    });
  });

  it('extracts type import', () => {
    const code = `import type { Task } from '@ai-fable/core';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports[0]).toMatchObject({
      moduleSpecifier: '@ai-fable/core',
      isPackageImport: true,
    });
  });

  it('extracts relative import', () => {
    const code = `import { canTransition } from './state-machine.js';`;
    const imports = extractImports(code, 'src/orchestrator.ts');
    expect(imports[0]).toMatchObject({
      moduleSpecifier: './state-machine.js',
      isPackageImport: false,
      importedNames: ['canTransition'],
    });
  });

  it('extracts namespace import', () => {
    const code = `import * as path from 'node:path';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports[0]).toMatchObject({
      moduleSpecifier: 'node:path',
      isPackageImport: true,
      importedNames: ['*'],
    });
  });

  it('extracts default import', () => {
    const code = `import Config from './config.js';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports[0]).toMatchObject({
      moduleSpecifier: './config.js',
      importedNames: ['default'],
    });
  });

  it('extracts side-effect import', () => {
    const code = `import './polyfill.js';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports[0]).toMatchObject({
      moduleSpecifier: './polyfill.js',
      importedNames: [],
    });
  });

  it('extracts re-export', () => {
    const code = `export { foo, bar } from './utils.js';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports[0]).toMatchObject({
      moduleSpecifier: './utils.js',
      isPackageImport: false,
    });
  });

  it('extracts multiple imports', () => {
    const code = `
import { A } from './a.js';
import { B } from './b.js';
import { C } from '@pkg/c';
`;
    const imports = extractImports(code, 'test.ts');
    expect(imports).toHaveLength(3);
    expect(imports[0].moduleSpecifier).toBe('./a.js');
    expect(imports[1].moduleSpecifier).toBe('./b.js');
    expect(imports[2].moduleSpecifier).toBe('@pkg/c');
  });

  it('handles aliased imports', () => {
    const code = `import { foo as bar, baz } from './mod.js';`;
    const imports = extractImports(code, 'test.ts');
    expect(imports[0].importedNames).toEqual(['foo', 'baz']);
  });
});

describe('isAnalyzable', () => {
  it('TypeScript is analyzable', () => {
    expect(isAnalyzable(Language.TypeScript)).toBe(true);
  });

  it('JavaScript is analyzable', () => {
    expect(isAnalyzable(Language.JavaScript)).toBe(true);
  });

  it('JSON is not analyzable', () => {
    expect(isAnalyzable(Language.JSON)).toBe(false);
  });

  it('Markdown is not analyzable', () => {
    expect(isAnalyzable(Language.Markdown)).toBe(false);
  });
});
