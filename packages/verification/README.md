# @ai-fable/verification

Verification Layer — pluggable verifiers, evidence collection, and acceptance policy for AI Fable.

## Overview

The Verification Layer answers one question: **"Can this change be accepted?"**

It coordinates pluggable verifiers, collects structured evidence, and evaluates an acceptance policy to produce a single pass/fail decision for the Orchestrator.

## Architecture

```
Task Finished
      │
      ▼
VerificationEngine
      │
      ├── BuildVerifier
      ├── TestVerifier
      ├── TypecheckVerifier
      ├── LintVerifier
      └── (future: SecurityVerifier, etc.)
      │
      ▼
AcceptancePolicy evaluation
      │
      ▼
VerificationReport (accepted / rejected)
```

## Key Design Decisions

- **Deterministic** — No AI/LLM involvement. Results are reproducible.
- **Pluggable** — Any verifier implementing the `Verifier` interface can be registered.
- **Policy-driven** — Acceptance logic is configured, not hardcoded.
- **Evidence-first** — Every verifier produces structured evidence, not just pass/fail.
- **Decoupled** — The engine knows nothing about Git, worktrees, or how code was produced.

## Verifier Interface

```typescript
interface Verifier {
  readonly name: string;
  verify(context: VerificationContext): Promise<VerifierResult>;
}
```

Verifiers MUST NOT throw. Errors are captured as `status: 'error'`.

## Built-in Verifiers

| Verifier | Default Command | Configurable |
|----------|----------------|--------------|
| `BuildVerifier` | `npm run build` | Yes |
| `TestVerifier` | `npm test` | Yes |
| `TypecheckVerifier` | `npx tsc --noEmit` | Yes |
| `LintVerifier` | `npm run lint` | Yes |

Each verifier:
- Runs a shell command
- Parses output for structured data (error counts, test counts)
- Returns evidence with duration, artifacts, and details

## Acceptance Policy

```typescript
const policy = defaultPolicy();
// → build (required), typecheck (required), tests (required), lint (advisory)
```

Policies define which verifiers must pass and which are advisory. The engine evaluates the policy after all verifiers run.

## Usage

```typescript
import {
  VerificationEngine,
  BuildVerifier,
  TestVerifier,
  TypecheckVerifier,
  LintVerifier,
  defaultPolicy,
} from '@ai-fable/verification';

const engine = new VerificationEngine({
  verifiers: [
    new BuildVerifier(),
    new TypecheckVerifier(),
    new TestVerifier(),
    new LintVerifier(),
  ],
  policy: defaultPolicy(),
});

const report = await engine.verify({ cwd: '/path/to/project' });

if (report.overallStatus === 'accepted') {
  // Proceed with commit/PR
} else {
  // Report failures
  console.log('Failed:', report.failedRequired);
}
```

## Known Limitations

- No AI/LLM review (intentionally excluded from this milestone)
- No security scanning
- No performance benchmarking
- Output parsing is regex-based (vitest/jest/eslint patterns)
- No incremental verification (all verifiers re-run from scratch)

## Scripts

```bash
pnpm build      # Compile TypeScript
pnpm test       # Run tests
pnpm typecheck  # Type check
pnpm clean      # Remove build artifacts
```
