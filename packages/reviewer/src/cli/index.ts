#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, printUsage } from './args.js';
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

function main(): void {
  // Parse CLI arguments (skip node and script path)
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options === null) {
    process.exit(1);
  }

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  console.log('AI Fable Reviewer');
  console.log('');

  const cwd = process.cwd();

  // 1. Verify Git repository
  if (!isGitRepository(cwd)) {
    console.error('❌ Not a Git repository.');
    process.exit(1);
  }

  const root = getRepositoryRoot(cwd);
  const status = getGitStatus(cwd);

  console.log(`Repository: ${root}`);
  console.log(`Branch: ${status.branch}`);
  console.log(`Mode: ${options.mode}`);
  console.log('');

  // 2. Read diff
  const rawDiff = getDiff(options.mode, cwd);

  if (!rawDiff) {
    console.log('No changes detected.');
    if (options.mode === 'staged') {
      console.log('Hint: stage files with `git add` or use `--all` to include unstaged changes.');
    }
    process.exit(0);
  }

  // 3. Parse diff
  const allFiles = parseDiff(rawDiff);

  // 4. Filter ignored files
  const { reviewable, skipped } = filterFiles(allFiles);

  if (reviewable.length === 0) {
    console.log('No reviewable files found (all changes were filtered).');
    if (skipped.length > 0) {
      console.log(`Skipped ${skipped.length} file(s): lockfiles, binaries, or ignored directories.`);
    }
    process.exit(0);
  }

  // 5. Chunk large diffs
  const chunks = chunkDiff(reviewable);
  if (chunks.length > 1) {
    console.log(`Diff split into ${chunks.length} chunks.`);
  }

  // 6. Generate reports
  const timestamp = new Date().toISOString();
  const fileTimestamp = formatTimestamp();
  const outputDir = resolve(cwd, options.output);

  mkdirSync(outputDir, { recursive: true });

  const reportPaths: string[] = [];

  if (options.markdown) {
    const markdown = generateMarkdown(root, status.branch, reviewable, skipped, timestamp);
    const mdPath = resolve(outputDir, `review-${fileTimestamp}.md`);
    writeFileSync(mdPath, markdown, 'utf-8');
    reportPaths.push(mdPath);
  }

  if (options.json) {
    const jsonOutput = generateJson(root, status.branch, reviewable, skipped, timestamp);
    const jsonPath = resolve(outputDir, `review-${fileTimestamp}.json`);
    writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2) + '\n', 'utf-8');
    reportPaths.push(jsonPath);
  }

  // 7. Print summary
  console.log(`Files reviewed: ${reviewable.length}`);
  if (skipped.length > 0) {
    console.log(`Files skipped: ${skipped.length}`);
  }
  console.log('');
  console.log('Reports:');
  for (const p of reportPaths) {
    console.log(`  ${p}`);
  }
  console.log('');
  console.log('Done.');
}

main();
