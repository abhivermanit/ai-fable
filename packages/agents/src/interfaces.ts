import type { Task, TaskStep, TaskResult } from '@ai-fable/core';

/**
 * The Planner breaks a task description into executable steps.
 *
 * The orchestrator calls the planner during the Planning phase.
 * Future implementations will use the Model Gateway to generate plans.
 */
export interface Planner {
  /**
   * Generate a plan (list of steps) for a task.
   */
  plan(task: Task): Promise<TaskStep[]>;
}

/**
 * A Worker executes a single step within a task.
 *
 * Workers are stateless (per architecture: "Agents are stateless and do
 * not own workflow state"). The orchestrator manages retries and state.
 */
export interface Worker {
  /**
   * The agent type this worker handles (matches TaskStep.agentType).
   */
  readonly agentType: string;

  /**
   * Execute a single step, returning the output or throwing on failure.
   */
  execute(step: TaskStep, context: WorkerContext): Promise<Record<string, unknown>>;
}

/**
 * Context passed to workers during step execution.
 */
export interface WorkerContext {
  /** The parent task */
  task: Task;
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

/**
 * The Verifier checks results after execution.
 *
 * Used during the Verifying phase. Future implementations will run
 * linting, type checking, tests, and LLM review.
 */
export interface Verifier {
  /**
   * Verify the results of a task's execution.
   * Returns a confidence score (0–1) and whether it passes.
   */
  verify(task: Task): Promise<VerificationResult>;
}

/**
 * Result of the verification phase.
 */
export interface VerificationResult {
  /** Whether verification passed */
  passed: boolean;
  /** Confidence score (0–1) */
  confidence: number;
  /** Issues found during verification */
  issues: VerificationIssue[];
}

/**
 * An issue found during verification.
 */
export interface VerificationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
}

/**
 * Persistence interface for saving and loading task state.
 *
 * The orchestrator uses this to persist tasks. The in-memory stub
 * is used until a real persistence layer is built (Milestone 6).
 */
export interface TaskStore {
  /**
   * Save or update a task.
   */
  save(task: Task): Promise<void>;

  /**
   * Load a task by ID. Returns undefined if not found.
   */
  load(id: string): Promise<Task | undefined>;

  /**
   * List all tasks, optionally filtered.
   */
  list(filter?: TaskFilter): Promise<Task[]>;

  /**
   * Delete a task by ID.
   */
  delete(id: string): Promise<boolean>;
}

/**
 * Filter criteria for listing tasks.
 */
export interface TaskFilter {
  status?: Task['status'];
  source?: string;
  limit?: number;
}

/**
 * Result of an orchestrator run (single task lifecycle).
 */
export type OrchestratorResult = TaskResult;
