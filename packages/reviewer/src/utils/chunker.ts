import type { DiffFile } from '@ai-fable/core';
import type { DiffChunk } from '../types/index.js';

/** Default chunk size in characters. */
const DEFAULT_CHUNK_SIZE = 50_000;

/**
 * Calculate approximate character size of a DiffFile.
 */
function fileSize(file: DiffFile): number {
  let size = file.filePath.length;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      size += line.length + 1; // +1 for newline
    }
  }
  return size;
}

/**
 * Split diff files into ordered chunks that respect file boundaries.
 *
 * - Never splits a file across chunks.
 * - Never splits inside a line.
 * - Chunks are ordered by original file order.
 * - Each chunk stays under maxSize characters (unless a single file exceeds it).
 */
export function chunkDiff(
  files: DiffFile[],
  maxSize: number = DEFAULT_CHUNK_SIZE,
): DiffChunk[] {
  if (files.length === 0) {
    return [];
  }

  const chunks: Array<{ files: DiffFile[]; size: number }> = [];
  let currentChunk: { files: DiffFile[]; size: number } = { files: [], size: 0 };

  for (const file of files) {
    const size = fileSize(file);

    // If adding this file would exceed limit, start a new chunk
    // (unless current chunk is empty — a single large file gets its own chunk)
    if (currentChunk.files.length > 0 && currentChunk.size + size > maxSize) {
      chunks.push(currentChunk);
      currentChunk = { files: [], size: 0 };
    }

    currentChunk.files.push(file);
    currentChunk.size += size;
  }

  // Push the last chunk
  if (currentChunk.files.length > 0) {
    chunks.push(currentChunk);
  }

  const total = chunks.length;

  return chunks.map((chunk, index) => ({
    index,
    total,
    files: chunk.files,
    size: chunk.size,
  }));
}
