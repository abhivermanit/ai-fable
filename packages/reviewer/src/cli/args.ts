import type { CliOptions } from '../types/index.js';

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
 * Parse CLI arguments into typed options.
 * Returns null and prints usage if arguments are invalid.
 */
export function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    mode: 'staged',
    output: './reviews',
    json: false,
    markdown: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--staged':
        options.mode = 'staged';
        break;
      case '--all':
        options.mode = 'all';
        break;
      case '--output': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          console.error('Error: --output requires a directory path.');
          console.log('');
          console.log(USAGE);
          return null;
        }
        options.output = next;
        i++;
        break;
      }
      case '--json':
        options.json = true;
        break;
      case '--markdown':
        options.markdown = true;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.log('');
        console.log(USAGE);
        return null;
    }
  }

  // If only --json is specified without --markdown, disable markdown
  if (options.json && !argv.includes('--markdown')) {
    options.markdown = false;
  }

  return options;
}

/**
 * Print usage information.
 */
export function printUsage(): void {
  console.log(USAGE);
}
