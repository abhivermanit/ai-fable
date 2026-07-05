import type { ReviewerConfig } from '../core/config.js';
import { createDefaultConfig } from '../core/config.js';
import { InvalidArgumentError } from '../core/errors.js';

const USAGE = `
AI Fable Reviewer

Usage:
  review [options]

Options:
  --staged       Review staged changes only (default)
  --all          Review all changes (staged + unstaged)
  --output DIR   Output directory for reports (default: ./reviews)
  --json         Generate JSON report
  --markdown     Generate Markdown report (default)
  --help         Show this help message

Examples:
  review
  review --staged
  review --all
  review --output ./reviews
  review --json
  review --markdown --json
`.trim();

/**
 * Result of argument parsing.
 */
export type ParseResult =
  | { ok: true; config: ReviewerConfig; help: false }
  | { ok: true; config: null; help: true }
  | { ok: false; error: InvalidArgumentError };

/**
 * Parse CLI arguments into a ReviewerConfig.
 */
export function parseArgs(argv: string[]): ParseResult {
  const config = createDefaultConfig();
  let jsonExplicit = false;
  let markdownExplicit = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    switch (arg) {
      case '--staged':
        config.mode = 'staged';
        break;
      case '--all':
        config.mode = 'all';
        break;
      case '--output': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          return { ok: false, error: new InvalidArgumentError('--output', 'requires a directory path') };
        }
        config.outputDirectory = next;
        i++;
        break;
      }
      case '--json':
        config.json = true;
        jsonExplicit = true;
        break;
      case '--markdown':
        config.markdown = true;
        markdownExplicit = true;
        break;
      case '--help':
        return { ok: true, config: null, help: true };
      default:
        return { ok: false, error: new InvalidArgumentError(arg, 'unknown option') };
    }
  }

  // If only --json specified without explicit --markdown, disable markdown
  if (jsonExplicit && !markdownExplicit) {
    config.markdown = false;
  }

  return { ok: true, config, help: false };
}

/**
 * Print usage information.
 */
export function printUsage(): void {
  console.log(USAGE);
}
