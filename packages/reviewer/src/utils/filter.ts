import type { DiffFile } from '@ai-fable/core';

/**
 * Directories to ignore entirely.
 */
const IGNORED_DIRECTORIES = [
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.turbo/',
  '.git/',
];

/**
 * Binary/non-reviewable file extensions.
 */
const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.webp', '.avif',
  // Fonts
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // Media
  '.mp3', '.mp4', '.avi', '.mov', '.webm', '.ogg',
  // Archives
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  // Compiled / binary
  '.wasm', '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  // PDFs and documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
]);

/**
 * Lockfiles to always skip.
 */
const LOCKFILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);

/**
 * Check if a file path is in an ignored directory.
 */
function isInIgnoredDirectory(filePath: string): boolean {
  return IGNORED_DIRECTORIES.some((dir) => filePath.startsWith(dir) || filePath.includes(`/${dir}`));
}

/**
 * Check if a file path has a binary extension.
 */
function hasBinaryExtension(filePath: string): boolean {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = filePath.slice(dotIndex).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if a file is a lockfile.
 */
function isLockfile(filePath: string): boolean {
  const basename = filePath.split('/').pop() ?? '';
  return LOCKFILES.has(basename);
}

/**
 * Determine if a file should be skipped.
 */
export function shouldSkip(filePath: string, isBinary: boolean): boolean {
  if (isBinary) return true;
  if (isInIgnoredDirectory(filePath)) return true;
  if (hasBinaryExtension(filePath)) return true;
  if (isLockfile(filePath)) return true;
  return false;
}

/**
 * Filter diff files, separating reviewable from skipped.
 */
export function filterFiles(files: DiffFile[]): {
  reviewable: DiffFile[];
  skipped: string[];
} {
  const reviewable: DiffFile[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (shouldSkip(file.filePath, file.isBinary)) {
      skipped.push(file.filePath);
    } else {
      reviewable.push(file);
    }
  }

  return { reviewable, skipped };
}
