import type { Task } from '@ai-fable/core';
import { TaskPriority } from '@ai-fable/core';

/**
 * A priority-based task queue.
 *
 * Tasks are dequeued highest-priority first, FIFO within the same priority.
 * The queue is designed with a clear seam for future locking (per ADR-0004 constraints).
 */
export class TaskQueue {
  private queues: Map<TaskPriority, Task[]> = new Map([
    [TaskPriority.Critical, []],
    [TaskPriority.High, []],
    [TaskPriority.Normal, []],
    [TaskPriority.Low, []],
  ]);

  /**
   * Add a task to the queue.
   */
  enqueue(task: Task): void {
    const queue = this.queues.get(task.priority);
    if (!queue) {
      throw new Error(`Unknown priority: ${task.priority}`);
    }
    queue.push(task);
  }

  /**
   * Remove and return the highest-priority task.
   * Returns undefined if the queue is empty.
   */
  dequeue(): Task | undefined {
    // Check priorities from highest to lowest
    const priorities = [
      TaskPriority.Critical,
      TaskPriority.High,
      TaskPriority.Normal,
      TaskPriority.Low,
    ];

    for (const priority of priorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift();
      }
    }

    return undefined;
  }

  /**
   * Peek at the next task without removing it.
   */
  peek(): Task | undefined {
    const priorities = [
      TaskPriority.Critical,
      TaskPriority.High,
      TaskPriority.Normal,
      TaskPriority.Low,
    ];

    for (const priority of priorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }

    return undefined;
  }

  /**
   * Remove a specific task from the queue by ID.
   * Returns true if the task was found and removed.
   */
  remove(taskId: string): boolean {
    for (const [, queue] of this.queues) {
      const index = queue.findIndex((t) => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Total number of tasks across all priorities.
   */
  get size(): number {
    let total = 0;
    for (const [, queue] of this.queues) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Whether the queue is empty.
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Get all queued tasks (for inspection/debugging).
   */
  all(): readonly Task[] {
    const result: Task[] = [];
    const priorities = [
      TaskPriority.Critical,
      TaskPriority.High,
      TaskPriority.Normal,
      TaskPriority.Low,
    ];
    for (const priority of priorities) {
      result.push(...this.queues.get(priority)!);
    }
    return result;
  }
}
