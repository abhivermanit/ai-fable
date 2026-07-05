import {
  TaskStatus,
  TaskPriority,
  TaskStepStatus,
} from '@ai-fable/core';
import type {
  Task,
  CreateTaskInput,
  TaskResult,
} from '@ai-fable/core';
import { assertTransition, isTerminal } from './state-machine.js';
import { TaskQueue } from './task-queue.js';
import { EventBus } from './event-bus.js';
import type { Planner, Worker, Verifier, TaskStore } from './interfaces.js';

/**
 * Configuration for the Task Orchestrator.
 */
export interface OrchestratorConfig {
  /** Planner implementation */
  planner: Planner;
  /** Map of agent type → worker implementation */
  workers: Map<string, Worker>;
  /** Verifier implementation */
  verifier: Verifier;
  /** Task persistence store */
  store: TaskStore;
  /** Max retries per task (per ADR-0005 interim: cap at 1) */
  maxRetries?: number;
}

/**
 * Generate a unique task ID.
 */
function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * The Task Orchestrator.
 *
 * Owns planning, execution, retries, state machine, and coordination.
 * Agents/workers are stateless — the orchestrator manages all state.
 */
export class Orchestrator {
  private readonly planner: Planner;
  private readonly workers: Map<string, Worker>;
  private readonly verifier: Verifier;
  private readonly store: TaskStore;
  private readonly maxRetries: number;

  public readonly queue: TaskQueue;
  public readonly events: EventBus;

  constructor(config: OrchestratorConfig) {
    this.planner = config.planner;
    this.workers = config.workers;
    this.verifier = config.verifier;
    this.store = config.store;
    this.maxRetries = config.maxRetries ?? 1;

    this.queue = new TaskQueue();
    this.events = new EventBus();
  }

  /**
   * Create a new task and add it to the queue.
   */
  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: generateId(),
      status: TaskStatus.Pending,
      priority: input.priority ?? TaskPriority.Normal,
      description: input.description,
      steps: [],
      metadata: {
        source: input.metadata?.source ?? 'unknown',
        repository: input.metadata?.repository,
        branch: input.metadata?.branch,
        retryCount: 0,
        maxRetries: this.maxRetries,
        labels: input.metadata?.labels ?? {},
      },
      createdAt: now,
      updatedAt: now,
    };

    await this.store.save(task);
    this.queue.enqueue(task);
    this.events.emit('task:created', { task });

    return task;
  }

  /**
   * Run the next task in the queue through its full lifecycle.
   *
   * Returns the task result, or undefined if the queue is empty.
   */
  async runNext(signal?: AbortSignal): Promise<TaskResult | undefined> {
    const task = this.queue.dequeue();
    if (!task) return undefined;

    return this.run(task, signal);
  }

  /**
   * Run a specific task through its full lifecycle.
   */
  async run(task: Task, signal?: AbortSignal): Promise<TaskResult> {
    const abortSignal = signal ?? new AbortController().signal;

    try {
      // Phase 1: Planning
      await this.transition(task, TaskStatus.Planning);
      const steps = await this.planner.plan(task);
      task.steps = steps;
      await this.transition(task, TaskStatus.Planned);

      // Phase 2: Execution
      await this.transition(task, TaskStatus.Running);
      task.startedAt = new Date().toISOString();
      await this.store.save(task);

      await this.executeSteps(task, abortSignal);

      // Phase 3: Verification
      await this.transition(task, TaskStatus.Verifying);
      const verification = await this.verifier.verify(task);

      if (verification.passed) {
        // Success
        const result: TaskResult = {
          success: true,
          steps: task.steps,
          confidence: verification.confidence,
          output: {},
        };
        task.result = result;
        await this.transition(task, TaskStatus.Completed);
        task.completedAt = new Date().toISOString();
        await this.store.save(task);
        this.events.emit('task:completed', { task });
        return result;
      }

      // Verification failed — can we retry?
      if (task.metadata.retryCount < task.metadata.maxRetries) {
        task.metadata.retryCount++;
        // Reset step statuses for retry
        for (const step of task.steps) {
          step.status = TaskStepStatus.Pending;
          step.output = undefined;
          step.error = undefined;
        }
        await this.transition(task, TaskStatus.Running);
        await this.executeSteps(task, abortSignal);

        // Re-verify after retry
        await this.transition(task, TaskStatus.Verifying);
        const retryVerification = await this.verifier.verify(task);

        if (retryVerification.passed) {
          const result: TaskResult = {
            success: true,
            steps: task.steps,
            confidence: retryVerification.confidence,
            output: {},
          };
          task.result = result;
          await this.transition(task, TaskStatus.Completed);
          task.completedAt = new Date().toISOString();
          await this.store.save(task);
          this.events.emit('task:completed', { task });
          return result;
        }
      }

      // All retries exhausted — fail
      const failResult: TaskResult = {
        success: false,
        steps: task.steps,
        confidence: verification.confidence,
        error: {
          code: 'VERIFICATION_FAILED',
          message: `Verification failed after ${task.metadata.retryCount} retries`,
          retryable: false,
          details: { issues: verification.issues },
        },
      };
      task.result = failResult;
      await this.transition(task, TaskStatus.Failed);
      task.completedAt = new Date().toISOString();
      await this.store.save(task);
      this.events.emit('task:failed', { task, error: failResult.error });
      return failResult;
    } catch (error) {
      // Unexpected error — fail the task
      if (!isTerminal(task.status)) {
        const failResult: TaskResult = {
          success: false,
          steps: task.steps,
          error: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          },
        };
        task.result = failResult;
        await this.transition(task, TaskStatus.Failed);
        task.completedAt = new Date().toISOString();
        await this.store.save(task);
        this.events.emit('task:failed', { task, error });
      }
      return task.result!;
    }
  }

  /**
   * Cancel a task (if it's not already in a terminal state).
   */
  async cancel(taskId: string): Promise<boolean> {
    const task = await this.store.load(taskId);
    if (!task) return false;
    if (isTerminal(task.status)) return false;

    // Try to remove from queue (if still queued)
    this.queue.remove(taskId);

    await this.transition(task, TaskStatus.Cancelled);
    task.completedAt = new Date().toISOString();
    await this.store.save(task);
    this.events.emit('task:cancelled', { task });
    return true;
  }

  /**
   * Get a task by ID.
   */
  async get(taskId: string): Promise<Task | undefined> {
    return this.store.load(taskId);
  }

  /**
   * Execute all steps in a task sequentially.
   */
  private async executeSteps(task: Task, signal: AbortSignal): Promise<void> {
    for (const step of task.steps) {
      if (signal.aborted) {
        step.status = TaskStepStatus.Skipped;
        continue;
      }

      const worker = this.workers.get(step.agentType);
      if (!worker) {
        step.status = TaskStepStatus.Failed;
        step.error = {
          code: 'NO_WORKER',
          message: `No worker registered for agent type: ${step.agentType}`,
          retryable: false,
        };
        throw new Error(step.error.message);
      }

      step.status = TaskStepStatus.Running;
      this.events.emit('task:step-started', { taskId: task.id, stepId: step.id });
      await this.store.save(task);

      try {
        const output = await worker.execute(step, { task, signal });
        step.output = output;
        step.status = TaskStepStatus.Completed;
        this.events.emit('task:step-completed', { taskId: task.id, stepId: step.id });
      } catch (error) {
        step.status = TaskStepStatus.Failed;
        step.error = {
          code: 'STEP_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        };
        this.events.emit('task:step-failed', {
          taskId: task.id,
          stepId: step.id,
          error,
        });
        throw error;
      }

      await this.store.save(task);
    }
  }

  /**
   * Transition a task to a new status, validating the state machine.
   */
  private async transition(task: Task, to: TaskStatus): Promise<void> {
    const from = task.status;
    assertTransition(from, to);
    task.status = to;
    task.updatedAt = new Date().toISOString();
    await this.store.save(task);
    this.events.emit('task:status-changed', { task, from, to });
  }
}
