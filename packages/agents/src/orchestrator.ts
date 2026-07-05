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
import { randomUUID } from 'node:crypto';
import { assertTransition, isTerminal } from './state-machine.js';
import { TaskQueue } from './task-queue.js';
import { EventBus } from './event-bus.js';
import type { Planner, Worker, Verifier, TaskStore, VerificationResult } from './interfaces.js';

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
  /** Max retries per task (per ADR-0005 interim: cap conservatively) */
  maxRetries?: number;
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

  /** Active AbortControllers for running tasks, keyed by task ID. */
  private readonly activeControllers = new Map<string, AbortController>();

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
      id: randomUUID(),
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

    // TODO: save() calls should eventually be batched when a real
    // persistence layer is introduced (Milestone 6). Currently each
    // state transition triggers a separate save.
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
    // Create an AbortController owned by this task execution.
    // If an external signal is provided, forward its abort.
    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);

    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
      }
    }

    try {
      // Phase 1: Planning
      await this.transition(task, TaskStatus.Planning);
      const steps = await this.planner.plan(task);
      task.steps = steps;
      await this.transition(task, TaskStatus.Planned);

      // Phase 2 & 3: Execute → Verify (with retry loop)
      return await this.executeWithRetries(task, controller);
    } catch (error) {
      // Unexpected error — fail the task (if not already terminal)
      // Re-check from store in case cancel() was called concurrently
      const currentTask = await this.store.load(task.id);
      if (currentTask && isTerminal(currentTask.status)) {
        // Task was already moved to a terminal state (e.g., cancelled)
        task.status = currentTask.status;
        task.result = task.result ?? {
          success: false,
          steps: task.steps,
          error: {
            code: 'TASK_CANCELLED',
            message: 'Task was cancelled',
            retryable: false,
          },
        };
        return task.result;
      }

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
    } finally {
      this.activeControllers.delete(task.id);
    }
  }

  /**
   * Cancel a task (if it's not already in a terminal state).
   *
   * If the task is currently running, signals the AbortController
   * to stop execution immediately.
   */
  async cancel(taskId: string): Promise<boolean> {
    const task = await this.store.load(taskId);
    if (!task) return false;
    if (isTerminal(task.status)) return false;

    // Signal abort to stop any running execution
    const controller = this.activeControllers.get(taskId);
    if (controller) {
      controller.abort('Task cancelled');
    }

    // Remove from queue (if still queued)
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
   * Execute steps and verify, retrying up to maxRetries times on verification failure.
   */
  private async executeWithRetries(task: Task, controller: AbortController): Promise<TaskResult> {
    let lastVerification: VerificationResult | undefined;

    // Initial execution + up to maxRetries retries
    for (let attempt = 0; attempt <= task.metadata.maxRetries; attempt++) {
      // Check for cancellation before starting execution
      if (controller.signal.aborted) {
        // Task was cancelled — don't proceed. The cancel() method
        // handles the state transition.
        return {
          success: false,
          steps: task.steps,
          error: {
            code: 'TASK_CANCELLED',
            message: 'Task was cancelled',
            retryable: false,
          },
        };
      }

      if (attempt > 0) {
        // This is a retry — reset step statuses
        task.metadata.retryCount = attempt;
        for (const step of task.steps) {
          step.status = TaskStepStatus.Pending;
          step.output = undefined;
          step.error = undefined;
        }
      }

      // Execute
      await this.transition(task, TaskStatus.Running);
      if (attempt === 0) {
        task.startedAt = new Date().toISOString();
      }
      await this.store.save(task);

      await this.executeSteps(task, controller.signal);

      // Check for cancellation after execution completes
      if (controller.signal.aborted) {
        return {
          success: false,
          steps: task.steps,
          error: {
            code: 'TASK_CANCELLED',
            message: 'Task was cancelled',
            retryable: false,
          },
        };
      }

      // Verify
      await this.transition(task, TaskStatus.Verifying);
      lastVerification = await this.verifier.verify(task);

      if (lastVerification.passed) {
        const result: TaskResult = {
          success: true,
          steps: task.steps,
          confidence: lastVerification.confidence,
          output: {},
        };
        task.result = result;
        await this.transition(task, TaskStatus.Completed);
        task.completedAt = new Date().toISOString();
        await this.store.save(task);
        this.events.emit('task:completed', { task });
        return result;
      }

      // Verification failed — loop will retry if attempts remain
    }

    // All retries exhausted — fail using the LAST verification result
    const failResult: TaskResult = {
      success: false,
      steps: task.steps,
      confidence: lastVerification!.confidence,
      error: {
        code: 'VERIFICATION_FAILED',
        message: `Verification failed after ${task.metadata.retryCount} retries`,
        retryable: false,
        details: { issues: lastVerification!.issues },
      },
    };
    task.result = failResult;
    await this.transition(task, TaskStatus.Failed);
    task.completedAt = new Date().toISOString();
    await this.store.save(task);
    this.events.emit('task:failed', { task, error: failResult.error });
    return failResult;
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
    // If task is already cancelled (via concurrent cancel()), don't transition
    if (isTerminal(task.status)) return;

    const from = task.status;
    assertTransition(from, to);
    task.status = to;
    task.updatedAt = new Date().toISOString();
    // TODO: save() calls should eventually be batched when a real
    // persistence layer is introduced (Milestone 6).
    await this.store.save(task);
    this.events.emit('task:status-changed', { task, from, to });
  }
}
