/**
 * A durable record of a task's lifecycle.
 *
 * This is not the live Task object from the Orchestrator — it's
 * the historical record stored in memory after a task completes
 * (or fails/is cancelled).
 */
export interface TaskRecord {
  /** Task ID (matches the Orchestrator's task.id) */
  id: string;
  /** Human-readable description */
  description: string;
  /** Final status */
  status: 'completed' | 'failed' | 'cancelled';
  /** Who/what created this task */
  source: string;
  /** Repository context */
  repository?: string;
  /** Branch context */
  branch?: string;
  /** When the task was created */
  createdAt: string;
  /** When the task finished */
  completedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Number of retry attempts */
  retryCount: number;
  /** Arbitrary labels for filtering */
  labels: Record<string, string>;
}

/**
 * A record of a single execution attempt within a task.
 */
export interface ExecutionRecord {
  /** Unique record ID */
  id: string;
  /** Task ID this execution belongs to */
  taskId: string;
  /** Attempt number (0 = first attempt, 1 = first retry, etc.) */
  attempt: number;
  /** Steps that were executed */
  steps: ExecutionStepRecord[];
  /** When this attempt started */
  startedAt: string;
  /** When this attempt ended */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether this attempt succeeded */
  success: boolean;
  /** Error info if failed */
  error?: string;
}

/**
 * Record of a single step execution.
 */
export interface ExecutionStepRecord {
  /** Step ID */
  id: string;
  /** Step description */
  description: string;
  /** Agent type that executed this step */
  agentType: string;
  /** Final step status */
  status: 'completed' | 'failed' | 'skipped';
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * A record of a verification run.
 */
export interface VerificationRecord {
  /** Unique record ID */
  id: string;
  /** Task ID this verification belongs to */
  taskId: string;
  /** Execution attempt this verification evaluated */
  executionId: string;
  /** Overall outcome */
  overallStatus: 'accepted' | 'rejected';
  /** Individual verifier outcomes */
  verifierResults: VerifierOutcome[];
  /** When verification started */
  startedAt: string;
  /** When verification completed */
  completedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Which required verifiers failed */
  failedRequired: string[];
  /** Which advisory verifiers failed */
  failedAdvisory: string[];
}

/**
 * Outcome of a single verifier within a verification run.
 */
export interface VerifierOutcome {
  /** Verifier name */
  name: string;
  /** Status */
  status: string;
  /** Human-readable message */
  message: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Artifact references */
  artifacts: string[];
}

/**
 * A stored artifact (diff, log, output, report).
 */
export interface Artifact {
  /** Unique artifact ID */
  id: string;
  /** Task ID this artifact belongs to */
  taskId: string;
  /** Artifact type */
  type: ArtifactType;
  /** Human-readable label */
  label: string;
  /** Content (text-based artifacts) */
  content?: string;
  /** File path (for file-based artifacts) */
  filePath?: string;
  /** Content size in bytes */
  size: number;
  /** When the artifact was created */
  createdAt: string;
  /** MIME type */
  mimeType: string;
}

/**
 * Types of artifacts the memory layer can store.
 */
export type ArtifactType = 'diff' | 'log' | 'output' | 'report' | 'snapshot' | 'other';

/**
 * Query parameters for searching memory.
 */
export interface MemoryQuery {
  /** Filter by task ID */
  taskId?: string;
  /** Filter by status */
  status?: string;
  /** Filter by source */
  source?: string;
  /** Filter by label key-value */
  label?: { key: string; value: string };
  /** Filter by date range (ISO strings) */
  after?: string;
  before?: string;
  /** Maximum results to return */
  limit?: number;
  /** Sort order */
  sort?: 'asc' | 'desc';
}
