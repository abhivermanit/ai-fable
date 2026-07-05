#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, printUsage } from './args.js';
import type { ReviewerConfig } from '../core/config.js';
import {
  logger,
  ReviewerError,
  GitNotFoundError,
  NotARepositoryError,
  EmptyDiffError,
  DiffTooLargeError,
  PermissionDeniedError,
} from '../core/index.js';
import {
  isGitRepository,
  getRepositoryRoot,
  getGitStatus,
} from '../git/index.js';
import { getDiff, parseDiff } from '../git/diff-reader.js';
import { filterFiles } from '../utils/filter.js';
import { chunkDiff } from '../utils/chunker.js';
import { generateMarkdown } from '../report/markdown.js';
import { generateJson } from '../report/json.js';

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '').replace('T', 'T').slice(0, 15);
}

/**
 * Run the reviewer with a validated config.
 */
function run(config: ReviewerConfig): void {
  const cwd = config.cwd;

  // 1. Verify Git repository
  if (!isGitRepository(cwd)) {
    throw new NotARepositoryError(cwd);
  }

  const root = getRepositoryRoot(cwd);
  const status = getGitStatus(cwd);

  logger.info('AI Fable Reviewer');
  logger.info('');
  logger.info(`Repository: ${root}`);
  logger.info(`Branch: ${status.branch}`);
  logger.info(`Mode: ${config.mode}`);
  logger.info('');

  // 2. Read diff
  const rawDiff = getDiff(config.mode, cwd);

  if (!rawDiff) {
    throw new EmptyDiffError(config.mode);
  }

  // 3. Check size limit
  const diffSizeBytes = Buffer.byteLength(rawDiff, 'utf-8');
  if (diffSizeBytes > config.maxDiffSize) {
    throw new DiffTooLargeError(diffSizeBytes, config.maxDiffSize);
  }

  logger.debug(`Diff size: ${(diffSizeBytes / 1024).toFixed(1)} KB`);

  // 4. Parse diff
  const allFiles = parseDiff(rawDiff);

  // 5. Filter ignored files
  const { reviewable, skipped } = filterFiles(allFiles);

  if (reviewable.length === 0) {
    logger.info('No reviewable files found (all changes were filtered).');
    if (skipped.length > 0) {
      logger.info(`Skipped ${skipped.length} file(s): lockfiles, binaries, or ignored directories.`);
    }
    return;
  }

  // 6. Chunk large diffs
  const chunks = chunkDiff(reviewable, config.chunkSize);
  if (chunks.length > 1) {
    logger.info(`Diff split into ${chunks.length} chunks.`);
  }

  // 7. Generate reports
  const timestamp = new Date().toISOString();
  const fileTimestamp = formatTimestamp();
  const outputDir = resolve(cwd, config.outputDirectory);

  try {
    mkdirSync(outputDir, { recursive: true });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new PermissionDeniedError(outputDir);
    }
    throw err;
  }

  const reportPaths: string[] = [];

  if (config.markdown) {
    const markdown = generateMarkdown(root, status.branch, reviewable, skipped, timestamp);
    const mdPath = resolve(outputDir, `review-${fileTimestamp}.md`);
    writeFileSync(mdPath, markdown, 'utf-8');
    reportPaths.push(mdPath);
  }

  if (config.json) {
    const jsonOutput = generateJson(root, status.branch, reviewable, skipped, timestamp);
    const jsonPath = resolve(outputDir, `review-${fileTimestamp}.json`);
    writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2) + '\n', 'utf-8');
    reportPaths.push(jsonPath);
  }

  // 8. Print summary
  logger.info(`Files reviewed: ${reviewable.length}`);
  if (skipped.length > 0) {
    logger.info(`Files skipped: ${skipped.length}`);
  }
  logger.info('');
  logger.info('Reports:');
  for (const p of reportPaths) {
    logger.info(`  ${p}`);
  }
  logger.info('');
  logger.info('Done.');
}

function main(): void {
  const result = parseArgs(process.argv.slice(2));

  if (!result.ok) {
    logger.error(result.error.message);
    printUsage();
    process.exit(1);
  }

  if (result.help) {
    printUsage();
    process.exit(0);
  }

  try {
    run(result.config);
  } catch (err: unknown) {
    if (err instanceof EmptyDiffError) {
      logger.info(err.message);
      process.exit(0);
    }

    if (err instanceof ReviewerError) {
      logger.error(err.message);
      process.exit(1);
    }

    // Detect git not found (command not found)
    if (err instanceof Error && err.message.includes('ENOENT') && err.message.includes('git')) {
      const gitErr = new GitNotFoundError();
      logger.error(gitErr.message);
      process.exit(1);
    }

    // Unknown error
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
