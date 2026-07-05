# AI Fable

AI Browser Agent Monorepo.

## Structure

```
apps/
  api/          — Backend API server
  playground/   — Interactive playground for testing agents

packages/
  agents/       — Agent orchestration logic
  browser/      — Browser automation primitives
  memory/       — Memory and state management
  models/       — LLM model integrations
  prompts/      — Prompt templates and management
  tools/        — Tool definitions for agents
  utils/        — Shared utilities

docs/           — Documentation
```

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run development servers
pnpm dev

# Lint
pnpm lint

# Format
pnpm format
```

## Configuration

Copy `.env.example` to `.env` and fill in the required values.

## License

Private
