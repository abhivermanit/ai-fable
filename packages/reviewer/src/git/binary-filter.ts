import type { DiffFile } from '@ai-fable/core';

/**
 * File extensions considered binary / non-reviewable.
 */
const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.avif',
  // Fonts
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // Media
  '.mp3', '.mp4', '.avi', '.mov', '.webm', '.ogg',
  // Archives
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  // Compiled / binary
  '.wasm', '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  // Lock files and generated
  '.lock',
  // PDFs and documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
]);

/**
 * Check if a file path has a binary extension.
 */
function hasBinaryExtension(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Filter diff files, separating reviewable from skipped.
 */
export function filterBinaries(files: DiffFile[]): {
  reviewable: DiffFile[];
  skipped: string[];
} {
  const reviewable: DiffFile[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (file.isBinary || hasBinaryExtension(file.filePath)) {
      skipped.push(file.filePath);
    } else {
      reviewable.push(file);
    }
  }

  return { reviewable, skipped };
}
