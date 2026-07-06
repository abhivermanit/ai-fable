/**
 * Status of a single verifier's result.
 *
 * - pass: Verification succeeded
 * - fail: Verification found issues
 * - warning: Passed with non-blocking concerns
 * - skip: Verifier was not run (aborted, or skipped due to prior failure)
 * - not_applicable: Verifier determined it doesn't apply to this context
 * - timeout: Verifier exceeded its time limit
 * - error: Verifier encountered an unexpected internal error
 */
export type VerifierStatus = 'pass' | 'fail' | 'warning' | 'skip' | 'not_applicable' | 'timeout' | 'error';

/**
 * A piece of structured evidence produced by a verifier.
 */
export interface Evidence {
  /** Which verifier produced this evidence */
  verifier: string;
  /** Pass/fail/skip/error status */
  status: VerifierStatus;
  /** Human-readable summary */
  message: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Artifact paths or identifiers (e.g., "jest.xml", "coverage/lcov.info") */
  artifacts: string[];
  /** Structured details (verifier-specific) */
  details?: Record<string, unknown>;
  /** Timestamp when this evidence was collected */
  timestamp: string;
}

/**
 * The result of a single verifier run.
 */
export interface VerifierResult {
  /** Verifier name */
  name: string;
  /** Pass/fail/skip/error */
  status: VerifierStatus;
  /** Evidence collected during verification */
  evidence: Evidence;
}

/**
 * Context passed to verifiers during execution.
 *
 * This intentionally decouples verifiers from Git/worktree knowledge.
 * Verifiers only know they have a working directory and can run commands.
 */
export interface VerificationContext {
  /** Working directory containing the code to verify */
  cwd: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Task description (for acceptance verification) */
  taskDescription?: string;
  /** Additional metadata from the task */
  metadata?: Record<string, unknown>;
}

/**
 * Interface that all verifiers implement.
 */
export interface Verifier {
  /** Unique name for this verifier */
  readonly name: string;

  /**
   * Run verification and return a result.
   *
   * Verifiers MUST NOT throw. Errors should be captured as
   * VerifierResult with status 'error'.
   */
  verify(context: VerificationContext): Promise<VerifierResult>;
}

/**
 * A rule in the acceptance policy.
 */
export interface AcceptanceRule {
  /** Which verifier this rule applies to */
  verifier: string;
  /** Whether this verifier must pass for overall acceptance */
  required: boolean;
  /** Human-readable description of the rule */
  description?: string;
}

/**
 * Acceptance policy configuration.
 *
 * Defines which verifiers must pass, which are advisory,
 * and the overall acceptance logic.
 */
export interface AcceptancePolicy {
  /** Rules for each verifier */
  rules: AcceptanceRule[];
  /** Whether ALL required verifiers must pass (default behavior) */
  requireAll: boolean;
}

/**
 * The final verification report produced by the engine.
 *
 * This is the single object the Orchestrator consumes.
 */
export interface VerificationReport {
  /** Overall pass/fail */
  overallStatus: 'accepted' | 'rejected';
  /** Individual verifier results */
  results: VerifierResult[];
  /** All collected evidence */
  evidence: Evidence[];
  /** Total verification duration in milliseconds */
  totalDurationMs: number;
  /** Which required verifiers failed (if rejected) */
  failedRequired: string[];
  /** Which advisory verifiers failed (informational) */
  failedAdvisory: string[];
  /** Timestamp when verification started */
  startedAt: string;
  /** Timestamp when verification completed */
  completedAt: string;
  /** The acceptance policy that was evaluated */
  policy: AcceptancePolicy;
}

/**
 * Configuration for the verification engine.
 */
export interface VerificationEngineConfig {
  /** Registered verifiers to run */
  verifiers: Verifier[];
  /** Acceptance policy */
  policy: AcceptancePolicy;
  /** Whether to run verifiers in parallel (default: false — sequential) */
  parallel?: boolean;
  /** Whether to continue running after a required verifier fails (default: false) */
  continueOnFailure?: boolean;
}
