/**
 * Status of a task as it moves through the orchestrator state machine.
 */
export enum TaskStatus {
  /** Task created, waiting in queue */
  Pending = 'pending',
  /** Planner is breaking the task into steps */
  Planning = 'planning',
  /** Plan is ready, waiting for execution */
  Planned = 'planned',
  /** Worker is executing steps */
  Running = 'running',
  /** Verification layer is checking results */
  Verifying = 'verifying',
  /** Task completed successfully */
  Completed = 'completed',
  /** Task failed after retries exhausted */
  Failed = 'failed',
  /** Task was cancelled by user or policy */
  Cancelled = 'cancelled',
}

/**
 * Priority levels for task queue ordering.
 */
export enum TaskPriority {
  Low = 0,
  Normal = 1,
  High = 2,
  Critical = 3,
}

/**
 * A single step within a task plan.
 */
export interface TaskStep {
  /** Unique identifier for this step */
  id: string;
  /** Human-readable description of what this step does */
  description: string;
  /** Step status (mirrors a subset of TaskStatus) */
  status: TaskStepStatus;
  /** Agent/worker type to handle this step */
  agentType: string;
  /** Input data for the step */
  input: Record<string, unknown>;
  /** Output produced by the step (populated after execution) */
  output?: Record<string, unknown>;
  /** Error information if the step failed */
  error?: TaskError;
}

/**
 * Status of an individual step within a task.
 */
export enum TaskStepStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/**
 * Structured error information.
 */
export interface TaskError {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether the error is retryable */
  retryable: boolean;
  /** Additional context */
  details?: Record<string, unknown>;
}

/**
 * The result of a completed (or failed) task.
 */
export interface TaskResult {
  /** Whether the task succeeded */
  success: boolean;
  /** Completed steps with their outputs */
  steps: TaskStep[];
  /** Confidence score from verification (0–1), if available */
  confidence?: number;
  /** Overall error if the task failed */
  error?: TaskError;
  /** Arbitrary output data from the task */
  output?: Record<string, unknown>;
}

/**
 * Metadata about a task's execution.
 */
export interface TaskMetadata {
  /** Who or what created this task */
  source: string;
  /** Repository context (if applicable) */
  repository?: string;
  /** Branch context (if applicable) */
  branch?: string;
  /** Number of retry attempts so far */
  retryCount: number;
  /** Maximum retries allowed (per ADR-0005 interim: cap at 1) */
  maxRetries: number;
  /** Arbitrary labels for filtering/grouping */
  labels: Record<string, string>;
}

/**
 * A task is the top-level unit of work managed by the Task Orchestrator.
 */
export interface Task {
  /** Unique identifier */
  id: string;
  /** Current status in the state machine */
  status: TaskStatus;
  /** Priority for queue ordering */
  priority: TaskPriority;
  /** Human-readable description of the task's goal */
  description: string;
  /** The plan (populated after planning phase) */
  steps: TaskStep[];
  /** The result (populated after completion or failure) */
  result?: TaskResult;
  /** Execution metadata */
  metadata: TaskMetadata;
  /** ISO timestamp when the task was created */
  createdAt: string;
  /** ISO timestamp of last status change */
  updatedAt: string;
  /** ISO timestamp when execution started */
  startedAt?: string;
  /** ISO timestamp when execution finished */
  completedAt?: string;
}

/**
 * Input for creating a new task.
 */
export interface CreateTaskInput {
  /** Human-readable description of the task's goal */
  description: string;
  /** Priority (defaults to Normal) */
  priority?: TaskPriority;
  /** Metadata overrides */
  metadata?: Partial<TaskMetadata>;
}
