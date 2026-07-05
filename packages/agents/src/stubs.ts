import { TaskStepStatus } from '@ai-fable/core';
import type { Task, TaskStep } from '@ai-fable/core';
import type {
  Planner,
  Worker,
  WorkerContext,
  Verifier,
  VerificationResult,
  TaskStore,
  TaskFilter,
} from './interfaces.js';

/**
 * A no-op planner that generates a single pass-through step.
 * Used for testing the orchestrator in isolation.
 */
export class StubPlanner implements Planner {
  async plan(task: Task): Promise<TaskStep[]> {
    return [
      {
        id: `${task.id}-step-1`,
        description: `Execute: ${task.description}`,
        status: TaskStepStatus.Pending,
        agentType: 'stub',
        input: {},
      },
    ];
  }
}

/**
 * A no-op worker that immediately resolves.
 * Used for testing the orchestrator in isolation.
 */
export class StubWorker implements Worker {
  readonly agentType = 'stub';

  async execute(
    _step: TaskStep,
    _context: WorkerContext,
  ): Promise<Record<string, unknown>> {
    return { result: 'stub-completed' };
  }
}

/**
 * A verifier that always passes with full confidence.
 * Used for testing the orchestrator in isolation.
 */
export class StubVerifier implements Verifier {
  async verify(_task: Task): Promise<VerificationResult> {
    return {
      passed: true,
      confidence: 1.0,
      issues: [],
    };
  }
}

/**
 * An in-memory task store for testing and development.
 */
export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    // Deep clone to avoid reference issues
    this.tasks.set(task.id, structuredClone(task));
  }

  async load(id: string): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    return task ? structuredClone(task) : undefined;
  }

  async list(filter?: TaskFilter): Promise<Task[]> {
    let results = [...this.tasks.values()];

    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }
    if (filter?.source) {
      results = results.filter((t) => t.metadata.source === filter.source);
    }
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results.map((t) => structuredClone(t));
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  /** For testing: get the raw map size */
  get size(): number {
    return this.tasks.size;
  }
}
