# @ai-fable/policy

Policy Engine — decision-making layer for AI Fable.

## Overview

The Policy Engine answers one question: **"Given the current state, what is the correct action?"**

The Orchestrator asks; the Policy Engine answers. This separation keeps organizational rules decoupled from execution logic.

## Architecture

```
Task Orchestrator
        │
  PolicyQuestion
        │
        ▼
  PolicyEngine
        │
  (rules evaluated in priority order)
        │
        ▼
  PolicyDecision (allowed/denied + reason + value)
```

## Question Types

| Question | What it asks |
|----------|-------------|
| `may-execute` | May this task execute? |
| `may-modify-repo` | May it modify this repository? |
| `may-modify-file` | May it modify this specific file? |
| `may-push` | May it push commits? |
| `may-create-pr` | May it create a pull request? |
| `may-run-command` | May it run this shell command? |
| `requires-approval` | Does this action require human approval? |
| `should-retry` | Should it retry after failure? |
| `select-model` | Which model should it use? |
| `max-timeout` | What timeout should apply? |
| `max-retries` | How many retries are allowed? |
| `max-concurrency` | How many concurrent tasks allowed? |

## Key Design Decisions

- **Policy separate from execution** — Rules don't execute actions; they answer questions
- **First-match wins** — Rules evaluated in priority order, first match produces the decision
- **Configurable presets** — Default (solo dev) and Strict (team/production) configs
- **Dynamic rules** — Rules can be added/removed at runtime
- **Pattern matching** — Wildcard patterns for repos, branches, files, commands
- **Overridable decisions** — Some denials can be overridden by human approval

## Default Policy

- Protected files: `.env*`, `*secret*`, `.git/*`, `*lock*`
- Branch protection: push to `main`/`master` denied (overridable)
- Task branches: push allowed freely
- Dangerous commands: `rm -rf /`, `push --force`, `reset --hard` blocked
- Retries: max 1 (per ADR-0005)
- Timeout: 5 minutes
- Concurrency: 1 task at a time
- Model: `claude-sonnet`

## Usage

```typescript
import { PolicyEngine, defaultPolicyConfig } from '@ai-fable/policy';

const engine = new PolicyEngine(defaultPolicyConfig());

// May we push to main?
const decision = engine.evaluate({
  type: 'may-push',
  context: { branch: 'main' },
});
// → { allowed: false, reason: 'Push to main requires approval', overridable: true }

// What model should we use?
const model = engine.getValue<string>({ type: 'select-model', context: {} });
// → 'claude-sonnet'

// Is this command safe?
engine.isAllowed({ type: 'may-run-command', context: { command: 'npm run build' } });
// → true
```

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm clean      # Remove build artifacts
```
