import { describe, it, expect } from 'vitest';

import { findPlanCycle } from './cycle.js';
import type { Task } from './schema.js';

function t(id: string, dependsOn: string[] = []): Task {
  return {
    id,
    role: 'coder',
    goal: 'g',
    prompt: 'p',
    dependsOn,
    acceptanceCriteria: [],
    capabilitiesNeeded: [],
  };
}

describe('findPlanCycle', () => {
  it('returns null for an empty list', () => {
    expect(findPlanCycle([])).toBeNull();
  });

  it('returns null for a single task with no deps', () => {
    expect(findPlanCycle([t('a')])).toBeNull();
  });

  it('returns null for a linear chain', () => {
    expect(findPlanCycle([t('a'), t('b', ['a']), t('c', ['b'])])).toBeNull();
  });

  it('returns null for a diamond', () => {
    expect(findPlanCycle([t('a'), t('b', ['a']), t('c', ['a']), t('d', ['b', 'c'])])).toBeNull();
  });

  it('detects a 2-cycle', () => {
    const cycle = findPlanCycle([t('a', ['b']), t('b', ['a'])]);
    expect(cycle).not.toBeNull();
    expect(cycle?.[0]).toBe(cycle?.[cycle.length - 1]);
  });

  it('detects a 3-cycle', () => {
    const cycle = findPlanCycle([t('a', ['c']), t('b', ['a']), t('c', ['b'])]);
    expect(cycle).not.toBeNull();
    expect(new Set(cycle ?? [])).toEqual(new Set(['a', 'b', 'c']));
  });

  it('detects a self-loop', () => {
    const cycle = findPlanCycle([t('a', ['a'])]);
    expect(cycle).toEqual(['a', 'a']);
  });

  it('ignores edges to unknown ids (handled by schema)', () => {
    expect(findPlanCycle([t('a', ['ghost'])])).toBeNull();
  });

  it('finds a cycle in a disconnected component', () => {
    const cycle = findPlanCycle([t('iso1'), t('iso2'), t('a', ['b']), t('b', ['a'])]);
    expect(cycle).not.toBeNull();
  });
});
