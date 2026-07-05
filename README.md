# AI Fable

Software engineering control plane — monorepo.

## Structure

```
apps/
  api/          — Backend API server
  playground/   — Interactive playground for testing agents

packages/
  agents/       — Agent orchestration logic
  browser/      — Browser automation primitives
  core/         — Shared interfaces, types, and constants
  memory/       — Memory and state management
  models/       — LLM model integrations (Model Gateway)
  prompts/      — Prompt templates and management
  reviewer/     — Code review agent (Milestone 1)
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
