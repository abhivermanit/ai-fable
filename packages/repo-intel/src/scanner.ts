import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { FileEntry, ScannerConfig } from './types.js';
import { Language } from './types.js';

/** Default max file size: 1MB */
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

/** Directories always ignored regardless of .gitignore */
const ALWAYS_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
]);

/** File extensions considered binary.
 *
 * Binary files are intentionally excluded from content hashing.
 * This means modifications to binary files will NOT be detected by
 * incremental indexing. This is acceptable because:
 * 1. Binary files are not analyzed for symbols or imports.
 * 2. Binary changes don't affect the dependency graph.
 * 3. Hashing large binaries would significantly slow scanning.
 *
 * If binary change detection becomes needed (e.g., for asset tracking),
 * enable hashing for binaries in a future version.
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.wav', '.avi',
  '.lock',
]);

/** Map of file extensions to languages */
const EXTENSION_MAP: Record<string, Language> = {
  '.ts': Language.TypeScript,
  '.tsx': Language.TypeScript,
  '.mts': Language.TypeScript,
  '.cts': Language.TypeScript,
  '.js': Language.JavaScript,
  '.jsx': Language.JavaScript,
  '.mjs': Language.JavaScript,
  '.cjs': Language.JavaScript,
  '.json': Language.JSON,
  '.md': Language.Markdown,
  '.mdx': Language.Markdown,
  '.yml': Language.YAML,
  '.yaml': Language.YAML,
  '.css': Language.CSS,
  '.scss': Language.CSS,
  '.less': Language.CSS,
  '.html': Language.HTML,
  '.htm': Language.HTML,
  '.sh': Language.Shell,
  '.bash': Language.Shell,
  '.zsh': Language.Shell,
};

/**
 * Parse a .gitignore file into a list of patterns.
 * Returns a function that checks if a relative path should be ignored.
 */
function parseGitignore(content: string): (relativePath: string) => boolean {
  const patterns: Array<{ pattern: string; negated: boolean; dirOnly: boolean }> = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    let pattern = line;
    const negated = pattern.startsWith('!');
    if (negated) pattern = pattern.slice(1);

    const dirOnly = pattern.endsWith('/');
    if (dirOnly) pattern = pattern.slice(0, -1);

    patterns.push({ pattern, negated, dirOnly });
  }

  return (relativePath: string): boolean => {
    let ignored = false;
    const segments = relativePath.split('/');

    for (const { pattern, negated, dirOnly } of patterns) {
      // Simple matching: check if any segment matches or if the full path matches
      const matches = matchesPattern(relativePath, segments, pattern, dirOnly);
      if (matches) {
        ignored = !negated;
      }
    }

    return ignored;
  };
}

/**
 * Simple gitignore-style pattern matching.
 */
function matchesPattern(
  relativePath: string,
  segments: string[],
  pattern: string,
  _dirOnly: boolean,
): boolean {
  // Pattern with slash means match from root
  if (pattern.includes('/')) {
    return simpleGlob(relativePath, pattern);
  }

  // Pattern without slash matches any segment
  for (const segment of segments) {
    if (simpleGlob(segment, pattern)) return true;
  }
  return false;
}

/**
 * Minimal glob matching (supports * and **).
 */
function simpleGlob(text: string, pattern: string): boolean {
  // Convert glob to regex
  let regex = '^';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*') {
      if (pattern[i + 1] === '*') {
        regex += '.*';
        i++; // skip second *
        if (pattern[i + 1] === '/') i++; // skip trailing /
      } else {
        regex += '[^/]*';
      }
    } else if (pattern[i] === '?') {
      regex += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(pattern[i])) {
      regex += '\\' + pattern[i];
    } else {
      regex += pattern[i];
    }
  }
  regex += '$';

  try {
    return new RegExp(regex).test(text);
  } catch {
    return false;
  }
}

/**
 * Detect language from file extension.
 */
export function detectLanguage(filePath: string): Language {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? Language.Unknown;
}

/**
 * Check if a file extension indicates a binary file.
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Compute SHA-256 hash of file content.
 */
export function hashContent(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Scan a repository directory and return file entries.
 */
export async function scanRepository(config: ScannerConfig): Promise<FileEntry[]> {
  const maxFileSize = config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const extraIgnore = config.ignorePatterns ?? [];

  // Load .gitignore from root
  let isGitignored: (path: string) => boolean = () => false;
  try {
    const gitignoreContent = await readFile(join(config.rootDir, '.gitignore'), 'utf-8');
    isGitignored = parseGitignore(gitignoreContent);
  } catch {
    // TODO: Use Logger service to distinguish "no .gitignore" from "read error"
  }

  // Build extra ignore checker
  const extraIgnoreCheck = (rel: string): boolean => {
    for (const pattern of extraIgnore) {
      if (simpleGlob(rel, pattern)) return true;
    }
    return false;
  };

  const entries: FileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dir, item.name);
      const relPath = relative(config.rootDir, fullPath);

      // Skip always-ignored directories
      if (item.isDirectory() && ALWAYS_IGNORED_DIRS.has(item.name)) {
        continue;
      }

      // Check gitignore
      if (isGitignored(relPath)) continue;

      // Check extra patterns
      if (extraIgnoreCheck(relPath)) continue;

      if (item.isDirectory()) {
        await walk(fullPath);
      } else if (item.isFile()) {
        const fileStat = await stat(fullPath);

        // Skip files exceeding size limit
        if (fileStat.size > maxFileSize) continue;

        const binary = isBinaryFile(fullPath);
        let hash = '';

        if (!binary) {
          try {
            const content = await readFile(fullPath);
            hash = hashContent(content);
          } catch {
            // TODO: Use Logger service to report unreadable files
            continue; // Skip unreadable files
          }
        }

        entries.push({
          path: fullPath,
          relativePath: relPath,
          language: detectLanguage(fullPath),
          size: fileStat.size,
          hash,
          lastModified: fileStat.mtime.toISOString(),
          isBinary: binary,
        });
      }
    }
  }

  await walk(config.rootDir);
  return entries;
}
