import type { DiffMode } from '../types/index.js';

/**
 * Central configuration for the reviewer.
 * All modules accept this instead of individual arguments.
 */
export interface ReviewerConfig {
  /** Diff mode: 'staged' or 'all' */
  mode: DiffMode;
  /** Output directory for reports */
  outputDirectory: string;
  /** Whether to generate markdown reports */
  markdown: boolean;
  /** Whether to generate JSON reports */
  json: boolean;
  /** Maximum chunk size in characters */
  chunkSize: number;
  /** Maximum diff size in bytes before rejecting (safety limit) */
  maxDiffSize: number;
  /** Working directory (repository root) */
  cwd: string;
}

/**
 * Default configuration values.
 */
export function createDefaultConfig(): ReviewerConfig {
  return {
    mode: 'staged',
    outputDirectory: './reviews',
    markdown: true,
    json: false,
    chunkSize: 50_000,
    maxDiffSize: 10 * 1024 * 1024, // 10 MB
    cwd: process.cwd(),
  };
}

/**
 * Create a config by merging partial overrides with defaults.
 */
export function createConfig(overrides: Partial<ReviewerConfig> = {}): ReviewerConfig {
  return { ...createDefaultConfig(), ...overrides };
}
