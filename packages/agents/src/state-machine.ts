import { TaskStatus } from '@ai-fable/core';

/**
 * Valid transitions for the task state machine.
 *
 * Each key is a current state, the value is the set of states
 * that can be transitioned to from that state.
 */
const TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  [TaskStatus.Pending]: new Set([
    TaskStatus.Planning,
    TaskStatus.Cancelled,
  ]),
  [TaskStatus.Planning]: new Set([
    TaskStatus.Planned,
    TaskStatus.Failed,
    TaskStatus.Cancelled,
  ]),
  [TaskStatus.Planned]: new Set([
    TaskStatus.Running,
    TaskStatus.Cancelled,
  ]),
  [TaskStatus.Running]: new Set([
    TaskStatus.Verifying,
    TaskStatus.Failed,
    TaskStatus.Cancelled,
  ]),
  [TaskStatus.Verifying]: new Set([
    TaskStatus.Completed,
    TaskStatus.Running, // retry on verification failure
    TaskStatus.Failed,
    TaskStatus.Cancelled,
  ]),
  // Terminal states — no transitions out
  [TaskStatus.Completed]: new Set(),
  [TaskStatus.Failed]: new Set(),
  [TaskStatus.Cancelled]: new Set(),
};

/**
 * Check if a transition from one status to another is valid.
 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].has(to);
}

/**
 * Assert a transition is valid, throwing if not.
 */
export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * Get all valid next states from a given status.
 */
export function validTransitions(from: TaskStatus): ReadonlySet<TaskStatus> {
  return TRANSITIONS[from];
}

/**
 * Check if a status is terminal (no further transitions possible).
 */
export function isTerminal(status: TaskStatus): boolean {
  return TRANSITIONS[status].size === 0;
}

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
  public readonly from: TaskStatus;
  public readonly to: TaskStatus;

  constructor(from: TaskStatus, to: TaskStatus) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}
