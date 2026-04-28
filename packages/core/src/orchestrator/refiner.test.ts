import { describe, expect, it } from 'vitest';

import {
  MAX_REFINEMENT_ITERATIONS,
  decodeRefinementPrompt,
  encodeRefinementPrompt,
  parseSectionEdits,
  type RefinementPromptPayload,
  type RefinementResult,
} from './refiner.js';

const sampleRefinement: RefinementResult = {
  enrichedGoal: 'TS + React TODO app',
  assumptions: ['single-user'],
  questions: [],
  ready: false,
  clarifyingQuestions: [
    {
      id: 'Q1',
      text: 'Auth?',
      options: [
        { label: 'A', value: 'email + password' },
        { label: 'B', value: 'no auth' },
      ],
    },
  ],
};

describe('encode/decodeRefinementPrompt', () => {
  it('round-trips a payload', () => {
    const payload: RefinementPromptPayload = {
      rawGoal: 'todo app',
      iteration: 0,
      refinement: sampleRefinement,
    };
    const encoded = encodeRefinementPrompt(payload);
    const decoded = decodeRefinementPrompt(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.rawGoal).toBe('todo app');
    expect(decoded?.iteration).toBe(0);
    expect(decoded?.refinement.enrichedGoal).toBe('TS + React TODO app');
  });

  it('decodes returns null on non-JSON input', () => {
    expect(decodeRefinementPrompt('approve')).toBeNull();
    expect(decodeRefinementPrompt('')).toBeNull();
    expect(decodeRefinementPrompt('{not-json')).toBeNull();
  });

  it('decode returns null when required fields are missing', () => {
    expect(decodeRefinementPrompt(JSON.stringify({}))).toBeNull();
    expect(decodeRefinementPrompt(JSON.stringify({ rawGoal: 'x' }))).toBeNull();
    expect(decodeRefinementPrompt(JSON.stringify({ rawGoal: 'x', iteration: 'oops' }))).toBeNull();
  });
});

describe('parseSectionEdits', () => {
  it('returns empty for non-comment responses', () => {
    expect(parseSectionEdits('approve')).toEqual({});
    expect(parseSectionEdits('reject')).toEqual({});
    expect(parseSectionEdits('')).toEqual({});
  });

  it('returns empty for comments without a section bracket', () => {
    expect(parseSectionEdits('comment:looks good')).toEqual({});
    expect(parseSectionEdits('comment:please add more tests')).toEqual({});
  });

  it('parses a bracketed PRD section edit', () => {
    expect(parseSectionEdits('comment:[prd:goals] add latency budget')).toEqual({
      'prd:goals': 'add latency budget',
    });
  });

  it('parses a bracketed MVP section edit', () => {
    expect(parseSectionEdits('comment:[mvp:features] drop tagging')).toEqual({
      'mvp:features': 'drop tagging',
    });
  });

  it('parses a Q<n>=<label> answer', () => {
    expect(parseSectionEdits('comment:Q1=B')).toEqual({ Q1: 'B' });
    expect(parseSectionEdits('comment:Q12=C')).toEqual({ Q12: 'C' });
  });

  it('rejects malformed section markers', () => {
    expect(parseSectionEdits('comment:[bad section] x')).toEqual({});
    expect(parseSectionEdits('comment:Q1=Z9')).toEqual({});
  });

  it('trims whitespace around the rest body', () => {
    expect(parseSectionEdits('comment:[prd:goals]   spaced   ')).toEqual({
      'prd:goals': 'spaced',
    });
  });
});

describe('MAX_REFINEMENT_ITERATIONS', () => {
  it('is a small positive integer (deadlock guard)', () => {
    expect(MAX_REFINEMENT_ITERATIONS).toBeGreaterThan(0);
    expect(MAX_REFINEMENT_ITERATIONS).toBeLessThanOrEqual(5);
  });
});
