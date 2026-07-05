#!/usr/bin/env node

import { isGitRepository, getRepositoryRoot, getGitStatus } from '../git/index.js';

function formatFileList(files: string[]): string {
  if (files.length === 0) return '  (none)';
  return files.map((f) => `  - ${f}`).join('\n');
}

function main(): void {
  console.log('AI Fable Reviewer');
  console.log('');

  const cwd = process.cwd();

  if (!isGitRepository(cwd)) {
    console.error('❌ Not a Git repository.');
    process.exit(1);
  }

  const root = getRepositoryRoot(cwd);
  const status = getGitStatus(cwd);

  console.log('Repository:');
  console.log(root);
  console.log('');
  console.log('Branch:');
  console.log(status.branch);
  console.log('');
  console.log('Status:');
  console.log('');
  console.log('Staged:');
  console.log(formatFileList(status.staged));
  console.log('');
  console.log('Modified:');
  console.log(formatFileList(status.modified));
  console.log('');
  console.log('Untracked:');
  console.log(formatFileList(status.untracked));
  console.log('');
  console.log('Merge Conflicts:');
  if (status.hasConflicts) {
    console.log('  ⚠️  Yes — resolve conflicts before reviewing.');
  } else {
    console.log('  No');
  }
}

main();
