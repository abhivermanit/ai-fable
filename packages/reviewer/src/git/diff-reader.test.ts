import { describe, it, expect } from 'vitest';
import { parseDiff } from './diff-reader.js';

const SAMPLE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from './foo';
+import { bar } from './bar';
 
 export function main() {
@@ -10,2 +11,3 @@
   return foo();
+  return bar();
 }
`;

const NEW_FILE_DIFF = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function hello() {
+  return 'world';
+}
`;

const DELETED_FILE_DIFF = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export function old() {
-  return 'gone';
-}
`;

const BINARY_DIFF = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abc1234
Binary files /dev/null and b/image.png differ
`;

const RENAME_DIFF = `diff --git a/old-name.ts b/new-name.ts
rename from old-name.ts
rename to new-name.ts
index abc1234..def5678 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,1 +1,1 @@
-export const name = 'old';
+export const name = 'new';
`;

describe('parseDiff', () => {
  it('returns empty array for empty string', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('parses a modified file with multiple hunks', () => {
    const files = parseDiff(SAMPLE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0]!.filePath).toBe('src/index.ts');
    expect(files[0]!.isNew).toBe(false);
    expect(files[0]!.isDeleted).toBe(false);
    expect(files[0]!.isBinary).toBe(false);
    expect(files[0]!.hunks).toHaveLength(2);
    expect(files[0]!.hunks[0]!.newStart).toBe(1);
    expect(files[0]!.hunks[1]!.newStart).toBe(11);
  });

  it('parses a new file', () => {
    const files = parseDiff(NEW_FILE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0]!.filePath).toBe('src/new.ts');
    expect(files[0]!.isNew).toBe(true);
    expect(files[0]!.isDeleted).toBe(false);
    expect(files[0]!.hunks[0]!.lines.filter((l) => l.startsWith('+'))).toHaveLength(3);
  });

  it('parses a deleted file', () => {
    const files = parseDiff(DELETED_FILE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0]!.filePath).toBe('src/old.ts');
    expect(files[0]!.isDeleted).toBe(true);
    expect(files[0]!.isNew).toBe(false);
  });

  it('detects binary files', () => {
    const files = parseDiff(BINARY_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0]!.filePath).toBe('image.png');
    expect(files[0]!.isBinary).toBe(true);
    expect(files[0]!.hunks).toHaveLength(0);
  });

  it('detects renamed files', () => {
    const files = parseDiff(RENAME_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0]!.filePath).toBe('new-name.ts');
    expect(files[0]!.oldFilePath).toBe('old-name.ts');
    expect(files[0]!.isRenamed).toBe(true);
  });

  it('parses multiple files in one diff', () => {
    const combined = SAMPLE_DIFF + NEW_FILE_DIFF + BINARY_DIFF;
    const files = parseDiff(combined);
    expect(files).toHaveLength(3);
  });
});
