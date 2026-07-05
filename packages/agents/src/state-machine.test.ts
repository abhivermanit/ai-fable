import { describe, it, expect } from 'vitest';
import { TaskStatus } from '@ai-fable/core';
import {
  canTransition,
  assertTransition,
  validTransitions,
  isTerminal,
  InvalidTransitionError,
} from './state-machine.js';

describe('state-machine', () => {
  describe('canTransition', () => {
    it('allows pending → planning', () => {
      expect(canTransition(TaskStatus.Pending, TaskStatus.Planning)).toBe(true);
    });

    it('allows pending → cancelled', () => {
      expect(canTransition(TaskStatus.Pending, TaskStatus.Cancelled)).toBe(true);
    });

    it('allows planning → planned', () => {
      expect(canTransition(TaskStatus.Planning, TaskStatus.Planned)).toBe(true);
    });

    it('allows planning → failed', () => {
      expect(canTransition(TaskStatus.Planning, TaskStatus.Failed)).toBe(true);
    });

    it('allows planned → running', () => {
      expect(canTransition(TaskStatus.Planned, TaskStatus.Running)).toBe(true);
    });

    it('allows running → verifying', () => {
      expect(canTransition(TaskStatus.Running, TaskStatus.Verifying)).toBe(true);
    });

    it('allows running → failed', () => {
      expect(canTransition(TaskStatus.Running, TaskStatus.Failed)).toBe(true);
    });

    it('allows verifying → completed', () => {
      expect(canTransition(TaskStatus.Verifying, TaskStatus.Completed)).toBe(true);
    });

    it('allows verifying → running (retry)', () => {
      expect(canTransition(TaskStatus.Verifying, TaskStatus.Running)).toBe(true);
    });

    it('allows verifying → failed', () => {
      expect(canTransition(TaskStatus.Verifying, TaskStatus.Failed)).toBe(true);
    });

    it('rejects pending → completed (skip states)', () => {
      expect(canTransition(TaskStatus.Pending, TaskStatus.Completed)).toBe(false);
    });

    it('rejects completed → anything', () => {
      expect(canTransition(TaskStatus.Completed, TaskStatus.Running)).toBe(false);
      expect(canTransition(TaskStatus.Completed, TaskStatus.Pending)).toBe(false);
    });

    it('rejects failed → anything', () => {
      expect(canTransition(TaskStatus.Failed, TaskStatus.Running)).toBe(false);
      expect(canTransition(TaskStatus.Failed, TaskStatus.Pending)).toBe(false);
    });

    it('rejects cancelled → anything', () => {
      expect(canTransition(TaskStatus.Cancelled, TaskStatus.Running)).toBe(false);
    });
  });

  describe('assertTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => assertTransition(TaskStatus.Pending, TaskStatus.Planning)).not.toThrow();
    });

    it('throws InvalidTransitionError for invalid transitions', () => {
      expect(() => assertTransition(TaskStatus.Pending, TaskStatus.Completed)).toThrow(
        InvalidTransitionError,
      );
    });

    it('error contains from and to states', () => {
      try {
        assertTransition(TaskStatus.Completed, TaskStatus.Running);
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidTransitionError);
        expect((e as InvalidTransitionError).from).toBe(TaskStatus.Completed);
        expect((e as InvalidTransitionError).to).toBe(TaskStatus.Running);
      }
    });
  });

  describe('validTransitions', () => {
    it('returns correct set for pending', () => {
      const valid = validTransitions(TaskStatus.Pending);
      expect(valid.has(TaskStatus.Planning)).toBe(true);
      expect(valid.has(TaskStatus.Cancelled)).toBe(true);
      expect(valid.size).toBe(2);
    });

    it('returns empty set for terminal states', () => {
      expect(validTransitions(TaskStatus.Completed).size).toBe(0);
      expect(validTransitions(TaskStatus.Failed).size).toBe(0);
      expect(validTransitions(TaskStatus.Cancelled).size).toBe(0);
    });
  });

  describe('isTerminal', () => {
    it('completed is terminal', () => {
      expect(isTerminal(TaskStatus.Completed)).toBe(true);
    });

    it('failed is terminal', () => {
      expect(isTerminal(TaskStatus.Failed)).toBe(true);
    });

    it('cancelled is terminal', () => {
      expect(isTerminal(TaskStatus.Cancelled)).toBe(true);
    });

    it('pending is not terminal', () => {
      expect(isTerminal(TaskStatus.Pending)).toBe(false);
    });

    it('running is not terminal', () => {
      expect(isTerminal(TaskStatus.Running)).toBe(false);
    });
  });
});
