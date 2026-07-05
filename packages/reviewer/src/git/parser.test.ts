import { describe, it, expect } from 'vitest';
import { parseStatusOutput } from './parser.js';

describe('parseStatusOutput', () => {
  it('returns empty status for empty input', () => {
    const result = parseStatusOutput('', 'main');
    expect(result).toEqual({
      branch: 'main',
      staged: [],
      modified: [],
      untracked: [],
      hasConflicts: false,
    });
  });

  it('parses staged files (M in index)', () => {
    const raw = 'M  src/index.ts\nM  src/utils.ts';
    const result = parseStatusOutput(raw, 'main');
    expect(result.staged).toEqual(['src/index.ts', 'src/utils.ts']);
    expect(result.modified).toEqual([]);
  });

  it('parses modified files (M in worktree)', () => {
    const raw = ' M src/index.ts\n M src/utils.ts';
    const result = parseStatusOutput(raw, 'feature');
    expect(result.modified).toEqual(['src/index.ts', 'src/utils.ts']);
    expect(result.staged).toEqual([]);
  });

  it('parses untracked files', () => {
    const raw = '?? new-file.ts\n?? docs/readme.md';
    const result = parseStatusOutput(raw, 'main');
    expect(result.untracked).toEqual(['new-file.ts', 'docs/readme.md']);
  });

  it('detects merge conflicts (UU)', () => {
    const raw = 'UU src/conflict.ts\n M src/ok.ts';
    const result = parseStatusOutput(raw, 'main');
    expect(result.hasConflicts).toBe(true);
    expect(result.modified).toEqual(['src/ok.ts']);
  });

  it('detects merge conflicts (AA)', () => {
    const raw = 'AA src/both-added.ts';
    const result = parseStatusOutput(raw, 'main');
    expect(result.hasConflicts).toBe(true);
  });

  it('handles mixed status', () => {
    const raw = 'M  staged.ts\n M modified.ts\n?? untracked.ts';
    const result = parseStatusOutput(raw, 'develop');
    expect(result.branch).toBe('develop');
    expect(result.staged).toEqual(['staged.ts']);
    expect(result.modified).toEqual(['modified.ts']);
    expect(result.untracked).toEqual(['untracked.ts']);
    expect(result.hasConflicts).toBe(false);
  });

  it('handles files both staged and modified (MM)', () => {
    const raw = 'MM src/index.ts';
    const result = parseStatusOutput(raw, 'main');
    expect(result.staged).toContain('src/index.ts');
    expect(result.modified).toContain('src/index.ts');
  });
});
