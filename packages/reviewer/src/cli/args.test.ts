import { describe, it, expect } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('returns default config with no arguments', () => {
    const result = parseArgs([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.help).toBe(false);
    expect(result.config!.mode).toBe('staged');
    expect(result.config!.outputDirectory).toBe('./reviews');
    expect(result.config!.markdown).toBe(true);
    expect(result.config!.json).toBe(false);
  });

  it('parses --all', () => {
    const result = parseArgs(['--all']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config!.mode).toBe('all');
  });

  it('parses --staged', () => {
    const result = parseArgs(['--staged']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config!.mode).toBe('staged');
  });

  it('parses --output with path', () => {
    const result = parseArgs(['--output', './custom-dir']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config!.outputDirectory).toBe('./custom-dir');
  });

  it('fails when --output has no value', () => {
    const result = parseArgs(['--output']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
  });

  it('fails when --output value starts with --', () => {
    const result = parseArgs(['--output', '--json']);
    expect(result.ok).toBe(false);
  });

  it('parses --json and disables markdown', () => {
    const result = parseArgs(['--json']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config!.json).toBe(true);
    expect(result.config!.markdown).toBe(false);
  });

  it('parses --markdown --json together', () => {
    const result = parseArgs(['--markdown', '--json']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config!.json).toBe(true);
    expect(result.config!.markdown).toBe(true);
  });

  it('parses --help', () => {
    const result = parseArgs(['--help']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.help).toBe(true);
  });

  it('fails on unknown argument', () => {
    const result = parseArgs(['--bogus']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_ARGUMENT');
    expect(result.error.message).toContain('--bogus');
  });

  it('parses multiple options together', () => {
    const result = parseArgs(['--all', '--json', '--markdown', '--output', '/tmp/out']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config!.mode).toBe('all');
    expect(result.config!.json).toBe(true);
    expect(result.config!.markdown).toBe(true);
    expect(result.config!.outputDirectory).toBe('/tmp/out');
  });
});
