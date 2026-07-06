import type {
  Verifier,
  VerifierResult,
  VerificationContext,
  VerificationReport,
  VerificationEngineConfig,
  AcceptancePolicy,
  Evidence,
} from './types.js';

/**
 * The Verification Engine.
 *
 * Coordinates verifiers, collects evidence, evaluates the acceptance policy,
 * and produces a single VerificationReport for the Orchestrator.
 *
 * The engine knows nothing about Git, worktrees, or how code was produced.
 * It only orchestrates verification of whatever is in the working directory.
 */
export class VerificationEngine {
  private readonly verifiers: Verifier[];
  private readonly policy: AcceptancePolicy;
  private readonly parallel: boolean;
  private readonly continueOnFailure: boolean;

  constructor(config: VerificationEngineConfig) {
    this.verifiers = config.verifiers;
    this.policy = config.policy;
    this.parallel = config.parallel ?? false;
    this.continueOnFailure = config.continueOnFailure ?? false;
  }

  /**
   * Run all registered verifiers and produce a report.
   */
  async verify(context: VerificationContext): Promise<VerificationReport> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    let results: VerifierResult[];

    if (this.parallel) {
      results = await this.runParallel(context);
    } else {
      results = await this.runSequential(context);
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    // Collect all evidence
    const evidence = results.map((r) => r.evidence);

    // Evaluate acceptance policy
    const { overallStatus, failedRequired, failedAdvisory } = this.evaluatePolicy(results);

    return {
      overallStatus,
      results,
      evidence,
      totalDurationMs,
      failedRequired,
      failedAdvisory,
      startedAt,
      completedAt,
      policy: this.policy,
    };
  }

  /**
   * Run verifiers sequentially, optionally stopping on required failure.
   */
  private async runSequential(context: VerificationContext): Promise<VerifierResult[]> {
    const results: VerifierResult[] = [];

    for (const verifier of this.verifiers) {
      // Check abort before running
      if (context.signal?.aborted) {
        results.push(this.makeSkipResult(verifier, 'Verification aborted'));
        continue;
      }

      const result = await this.runSafe(verifier, context);
      results.push(result);

      // If a required verifier failed and we're not continuing, stop
      if (!this.continueOnFailure && result.status === 'fail') {
        const rule = this.policy.rules.find((r) => r.verifier === verifier.name);
        if (rule?.required) {
          // Skip remaining verifiers
          const remaining = this.verifiers.slice(this.verifiers.indexOf(verifier) + 1);
          for (const skipped of remaining) {
            results.push(this.makeSkipResult(skipped, 'Skipped due to prior required failure'));
          }
          break;
        }
      }
    }

    return results;
  }

  /**
   * Run all verifiers in parallel.
   */
  private async runParallel(context: VerificationContext): Promise<VerifierResult[]> {
    return Promise.all(
      this.verifiers.map((verifier) => this.runSafe(verifier, context)),
    );
  }

  /**
   * Run a single verifier safely — catch any thrown errors.
   */
  private async runSafe(verifier: Verifier, context: VerificationContext): Promise<VerifierResult> {
    try {
      return await verifier.verify(context);
    } catch (error) {
      // Verifiers SHOULD NOT throw, but if they do, wrap it
      return {
        name: verifier.name,
        status: 'error',
        evidence: {
          verifier: verifier.name,
          status: 'error',
          message: `Verifier threw an unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          durationMs: 0,
          artifacts: [],
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Create a skip result for verifiers that weren't run.
   */
  private makeSkipResult(verifier: Verifier, reason: string): VerifierResult {
    return {
      name: verifier.name,
      status: 'skip',
      evidence: {
        verifier: verifier.name,
        status: 'skip',
        message: reason,
        durationMs: 0,
        artifacts: [],
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Evaluate the acceptance policy against verifier results.
   */
  private evaluatePolicy(results: VerifierResult[]): {
    overallStatus: 'accepted' | 'rejected';
    failedRequired: string[];
    failedAdvisory: string[];
  } {
    const failedRequired: string[] = [];
    const failedAdvisory: string[] = [];

    for (const result of results) {
      if (result.status === 'pass' || result.status === 'skip') continue;

      const rule = this.policy.rules.find((r) => r.verifier === result.name);

      if (rule?.required) {
        failedRequired.push(result.name);
      } else {
        failedAdvisory.push(result.name);
      }
    }

    // Default: verifiers without explicit rules are advisory
    const overallStatus: 'accepted' | 'rejected' =
      this.policy.requireAll && failedRequired.length > 0
        ? 'rejected'
        : failedRequired.length > 0
          ? 'rejected'
          : 'accepted';

    return { overallStatus, failedRequired, failedAdvisory };
  }
}
