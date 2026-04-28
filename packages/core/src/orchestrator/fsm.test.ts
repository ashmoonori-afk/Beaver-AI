import { describe, expect, it } from 'vitest';

import {
  InvalidTransitionError,
  RUN_STATES,
  TERMINAL_STATES,
  transition,
  type RunEvent,
  type RunState,
} from './fsm.js';

describe('TERMINAL_STATES', () => {
  it('contains exactly COMPLETED, FAILED, ABORTED', () => {
    const sorted = [...TERMINAL_STATES].sort();
    expect(sorted).toEqual(['ABORTED', 'COMPLETED', 'FAILED']);
  });

  it('terminals are a subset of RUN_STATES', () => {
    for (const s of TERMINAL_STATES) {
      expect(RUN_STATES).toContain(s);
    }
  });
});

describe('transition — happy paths', () => {
  it('INITIALIZED + GOAL_REFINEMENT_STARTED -> REFINING_GOAL (Phase 7)', () => {
    expect(transition('INITIALIZED', { type: 'GOAL_REFINEMENT_STARTED' })).toBe('REFINING_GOAL');
  });

  it('REFINING_GOAL + GOAL_REFINED -> PLANNING (Phase 7)', () => {
    expect(transition('REFINING_GOAL', { type: 'GOAL_REFINED' })).toBe('PLANNING');
  });

  it('INITIALIZED + PLAN_DRAFTED -> PLANNING (skip-refinement / backward compat)', () => {
    expect(transition('INITIALIZED', { type: 'PLAN_DRAFTED' })).toBe('PLANNING');
  });

  it('PLANNING + PLAN_APPROVED -> EXECUTING', () => {
    expect(transition('PLANNING', { type: 'PLAN_APPROVED' })).toBe('EXECUTING');
  });

  it('PLANNING + FINAL_REVIEW_REQUESTED -> FINAL_REVIEW_PENDING (empty plan)', () => {
    expect(transition('PLANNING', { type: 'FINAL_REVIEW_REQUESTED' })).toBe('FINAL_REVIEW_PENDING');
  });

  it('EXECUTING + TASK_DISPATCHED stays in EXECUTING', () => {
    expect(transition('EXECUTING', { type: 'TASK_DISPATCHED' })).toBe('EXECUTING');
  });

  it('EXECUTING + TASK_COMPLETED -> REVIEWING', () => {
    expect(transition('EXECUTING', { type: 'TASK_COMPLETED' })).toBe('REVIEWING');
  });

  it('REVIEWING + REVIEW_DONE -> EXECUTING', () => {
    expect(transition('REVIEWING', { type: 'REVIEW_DONE' })).toBe('EXECUTING');
  });

  it('REVIEWING + FINAL_REVIEW_REQUESTED -> FINAL_REVIEW_PENDING', () => {
    expect(transition('REVIEWING', { type: 'FINAL_REVIEW_REQUESTED' })).toBe(
      'FINAL_REVIEW_PENDING',
    );
  });

  it('FINAL_REVIEW_PENDING + FINAL_APPROVED -> COMPLETED', () => {
    expect(transition('FINAL_REVIEW_PENDING', { type: 'FINAL_APPROVED' })).toBe('COMPLETED');
  });
});

describe('transition — universal escape hatches', () => {
  const nonTerminal: RunState[] = [
    'INITIALIZED',
    'REFINING_GOAL',
    'PLANNING',
    'EXECUTING',
    'REVIEWING',
    'FINAL_REVIEW_PENDING',
  ];

  it('FAIL from any non-terminal -> FAILED', () => {
    for (const s of nonTerminal) {
      expect(transition(s, { type: 'FAIL', reason: 'x' })).toBe('FAILED');
    }
  });

  it('ABORT from any non-terminal -> ABORTED', () => {
    for (const s of nonTerminal) {
      expect(transition(s, { type: 'ABORT', reason: 'user' })).toBe('ABORTED');
    }
  });
});

describe('transition — invalid pairs throw with from + event in message', () => {
  it('REVIEWING from INITIALIZED is rejected', () => {
    let caught: unknown;
    try {
      transition('INITIALIZED', { type: 'TASK_COMPLETED' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    const err = caught as InvalidTransitionError;
    expect(err.message).toContain('INITIALIZED');
    expect(err.message).toContain('TASK_COMPLETED');
    expect(err.from).toBe('INITIALIZED');
    expect(err.eventType).toBe('TASK_COMPLETED');
  });

  it('PLAN_DRAFTED from EXECUTING is rejected', () => {
    expect(() => transition('EXECUTING', { type: 'PLAN_DRAFTED' })).toThrow(InvalidTransitionError);
  });

  it('any event from a terminal state is rejected', () => {
    for (const t of TERMINAL_STATES) {
      const ev: RunEvent = { type: 'PLAN_APPROVED' };
      expect(() => transition(t, ev)).toThrow(InvalidTransitionError);
    }
  });
});
