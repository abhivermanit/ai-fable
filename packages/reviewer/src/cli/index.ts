#!/usr/bin/env node

import { readGitDiff, parseDiff, filterBinaries } from '../git/index.js';
import { generateMarkdownReport } from '../report/index.js';

function main(): void {
  const cwd = process.cwd();

  // 1. Read git diff
  const rawDiff = readGitDiff(cwd);

  if (!rawDiff) {
    console.log('No changes detected. Stage files or make changes to review.');
    process.exit(0);
  }

  // 2. Parse diff
  const files = parseDiff(rawDiff);

  // 3. Filter binaries
  const { reviewable, skipped } = filterBinaries(files);

  // 4. Generate report
  const report = generateMarkdownReport(reviewable, skipped);

  // 5. Output
  console.log(report.markdown);
}

main();
