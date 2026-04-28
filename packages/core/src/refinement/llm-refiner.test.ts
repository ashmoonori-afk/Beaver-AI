import { describe, expect, it, vi } from 'vitest';

import type { ProviderAdapter, RunOptions, RunResult } from '../types/provider.js';

import { makeLlmRefiner } from './llm-refiner.js';

function fakeAdapter(answer: string | (() => string)): ProviderAdapter {
  const adapter: ProviderAdapter = {
    name: 'fake',
    capabilities: ['streaming'],
    cost: () => ({ usd: 0, tokensIn: 0, tokensOut: 0 }),
    run: vi.fn(async (_opts: RunOptions): Promise<RunResult> => {
      return {
        status: 'ok',
        summary: 'done',
        artifacts: [],
        usage: { tokensIn: 1, tokensOut: 1, model: 'fake' },
        finalAssistantMessage: typeof answer === 'function' ? answer() : answer,
        rawTranscriptPath: '/tmp/fake',
      };
    }),
  };
  return adapter;
}

const validJson = JSON.stringify({
  enrichedGoal: 'TS + React TODO',
  assumptions: ['single-user'],
  questions: [],
  prd: {
    overview: 'A local TODO app.',
    goals: ['create task fast'],
    userStories: [
      {
        id: 'US-001',
        title: 'Create',
        description: 'As a user, I type and press Enter.',
        acceptanceCriteria: ['empty rejected'],
      },
    ],
    nonGoals: ['no sync'],
    successMetrics: ['tests pass'],
  },
  mvp: {
    pitch: 'Offline TODO.',
    features: ['add'],
    deferred: ['auth'],
    scope: '~3 days',
  },
  ready: false,
});

describe('makeLlmRefiner', () => {
  it('parses a well-formed adapter response and returns the refinement', async () => {
    const adapter = fakeAdapter(validJson);
    const refiner = makeLlmRefiner({ adapter });
    const result = await refiner({ rawGoal: 'todo app' });
    expect(result.enrichedGoal).toMatch(/TODO/);
    expect(result.prd?.userStories).toHaveLength(1);
    expect(adapter.run).toHaveBeenCalledTimes(1);
  });

  it('strips fences before parsing', async () => {
    const fenced = '```json\n' + validJson + '\n```';
    const adapter = fakeAdapter(fenced);
    const refiner = makeLlmRefiner({ adapter });
    const result = await refiner({ rawGoal: 'todo app' });
    expect(result.enrichedGoal).toBeDefined();
  });

  it('retries once on parse failure with a corrective hint', async () => {
    let calls = 0;
    const adapter = fakeAdapter(() => {
      calls += 1;
      return calls === 1 ? 'not json at all' : validJson;
    });
    const refiner = makeLlmRefiner({ adapter, maxParseRetries: 1 });
    const result = await refiner({ rawGoal: 'todo app' });
    expect(calls).toBe(2);
    expect(result.enrichedGoal).toBeDefined();
  });

  it('falls back to ready-with-rawGoal when retries exhausted', async () => {
    const adapter = fakeAdapter('still not json');
    const refiner = makeLlmRefiner({ adapter, maxParseRetries: 1 });
    const result = await refiner({ rawGoal: 'build a todo app' });
    expect(result.enrichedGoal).toBe('build a todo app');
    expect(result.ready).toBe(true);
    expect(result.assumptions[0]).toMatch(/refinement failed/i);
  });

  it('threads sectionEdits into the prompt', async () => {
    const adapter = fakeAdapter(validJson);
    const refiner = makeLlmRefiner({ adapter });
    await refiner({
      rawGoal: 'todo app',
      sectionEdits: { 'prd:goals': 'add latency budget' },
    });
    const runMock = adapter.run as unknown as ReturnType<typeof vi.fn>;
    const args = runMock.mock.calls[0]?.[0] as RunOptions;
    expect(args.prompt).toMatch(/SECTION EDITS/);
    expect(args.prompt).toMatch(/prd:goals/);
    expect(args.prompt).toMatch(/add latency budget/);
  });

  it('threads priorResponse into the prompt', async () => {
    const adapter = fakeAdapter(validJson);
    const refiner = makeLlmRefiner({ adapter });
    await refiner({ rawGoal: 'todo app', priorResponse: 'looks good' });
    const runMock = adapter.run as unknown as ReturnType<typeof vi.fn>;
    const args = runMock.mock.calls[0]?.[0] as RunOptions;
    expect(args.prompt).toMatch(/PRIOR USER RESPONSE/);
  });
});
