import type { Task, TaskStatus } from '@ai-fable/core';

/**
 * Events emitted by the Task Orchestrator.
 */
export interface OrchestratorEvents {
  'task:created': { task: Task };
  'task:status-changed': { task: Task; from: TaskStatus; to: TaskStatus };
  'task:step-started': { taskId: string; stepId: string };
  'task:step-completed': { taskId: string; stepId: string };
  'task:step-failed': { taskId: string; stepId: string; error: unknown };
  'task:completed': { task: Task };
  'task:failed': { task: Task; error: unknown };
  'task:cancelled': { task: Task };
}

type EventName = keyof OrchestratorEvents;
type EventHandler<E extends EventName> = (payload: OrchestratorEvents[E]) => void | Promise<void>;

/**
 * A typed event bus for orchestrator lifecycle events.
 *
 * Handlers are invoked synchronously in registration order.
 * Async handlers are fire-and-forget (errors are logged but do not
 * interrupt other handlers or the emitting code).
 *
 * TODO: Replace console.error with a proper Logger service once
 * the logging infrastructure is built. The Logger should support
 * structured logging, log levels, and configurable transports.
 */
export class EventBus {
  private handlers = new Map<EventName, Set<EventHandler<EventName>>>();

  /**
   * Register a handler for an event.
   * Returns an unsubscribe function.
   */
  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler as EventHandler<EventName>);

    return () => {
      set.delete(handler as EventHandler<EventName>);
    };
  }

  /**
   * Emit an event, invoking all registered handlers.
   *
   * Handler errors are logged but do not propagate to the caller
   * or prevent other handlers from executing.
   */
  emit<E extends EventName>(event: E, payload: OrchestratorEvents[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;

    for (const handler of set) {
      try {
        const result = handler(payload);
        // If async, catch and log errors
        if (result && typeof result === 'object' && 'catch' in result) {
          (result as Promise<void>).catch((err: unknown) => {
            // TODO: Use Logger service instead of console.error
            console.error(
              `[EventBus] Async handler error for event "${event}":`,
              err,
            );
          });
        }
      } catch (err: unknown) {
        // TODO: Use Logger service instead of console.error
        console.error(
          `[EventBus] Sync handler error for event "${event}":`,
          err,
        );
      }
    }
  }

  /**
   * Remove all handlers for a specific event, or all events if none specified.
   */
  clear(event?: EventName): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
