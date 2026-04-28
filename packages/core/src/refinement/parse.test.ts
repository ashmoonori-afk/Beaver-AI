import { describe, expect, it } from 'vitest';

import { extractJsonObject, parseRefinementJson } from './parse.js';

const validRefinement = {
  enrichedGoal: 'TS + React TODO app with SQLite',
  assumptions: ['single-user'],
  questions: [],
  prd: {
    overview: 'Local TODO app.',
    goals: ['create task fast'],
    userStories: [
      {
        id: 'US-001',
        title: 'Create',
        description: 'As a user, I want to type and press Enter so it saves.',
        acceptanceCriteria: ['empty rejected', 'persists to SQLite'],
      },
    ],
    nonGoals: ['no sync'],
    successMetrics: ['tests pass'],
  },
  mvp: {
    pitch: 'Offline-first TODO.',
    features: ['add', 'toggle done'],
    deferred: ['auth'],
    scope: '~3 days',
  },
  ready: false,
};

describe('extractJsonObject', () => {
  it('returns the input when it is already pure JSON', () => {
    const s = '{"a":1}';
    expect(extractJsonObject(s)).toBe('{"a":1}');
  });

  it('strips markdown fences (```json ... ```)', () => {
    const fenced = '```json\n{"a":1}\n```';
    expect(extractJsonObject(fenced)).toBe('{"a":1}');
  });

  it('strips bare fences (``` ... ```)', () => {
    const fenced = '```\n{"a":1}\n```';
    expect(extractJsonObject(fenced)).toBe('{"a":1}');
  });

  it('strips a preamble before the first {', () => {
    const s = 'Here\'s the spec:\n{"a":1}';
    expect(extractJsonObject(s)).toBe('{"a":1}');
  });

  it('handles strings containing braces in their values', () => {
    const s = '{"text":"a{b}c","ok":true}';
    expect(extractJsonObject(s)).toBe('{"text":"a{b}c","ok":true}');
  });

  it('handles escaped quotes inside string values', () => {
    const s = '{"text":"a\\"b"}';
    expect(extractJsonObject(s)).toBe('{"text":"a\\"b"}');
  });

  it('returns null when no JSON object is present', () => {
    expect(extractJsonObject('hello world')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });

  it('returns null for unbalanced braces', () => {
    expect(extractJsonObject('{"a":1')).toBeNull();
  });
});

describe('parseRefinementJson', () => {
  it('accepts a well-formed refinement payload', () => {
    const out = parseRefinementJson(JSON.stringify(validRefinement));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.enrichedGoal).toMatch(/TODO app/);
      expect(out.result.prd?.userStories).toHaveLength(1);
    }
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(validRefinement) + '\n```';
    const out = parseRefinementJson(fenced);
    expect(out.ok).toBe(true);
  });

  it('rejects malformed JSON with a structured error', () => {
    const out = parseRefinementJson('not json at all');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/no JSON|parse/i);
  });

  it('rejects payloads missing required fields', () => {
    const out = parseRefinementJson(JSON.stringify({ enrichedGoal: '' }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/schema|validation/i);
  });

  it('accepts minimal ready=true payload (prd/mvp optional)', () => {
    const out = parseRefinementJson(
      JSON.stringify({
        enrichedGoal: 'clear and unambiguous',
        ready: true,
      }),
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.ready).toBe(true);
      expect(out.result.assumptions).toEqual([]);
    }
  });

  it('rejects user stories with empty acceptance criteria array values', () => {
    const bad = {
      ...validRefinement,
      prd: {
        ...validRefinement.prd,
        userStories: [
          {
            id: 'US-001',
            title: 'x',
            description: 'y',
            acceptanceCriteria: [''], // empty string blocked by z.string().min(1)
          },
        ],
      },
    };
    const out = parseRefinementJson(JSON.stringify(bad));
    expect(out.ok).toBe(false);
  });
});
