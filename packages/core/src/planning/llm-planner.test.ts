import { describe, expect, it, vi } from 'vitest';

import type { ProviderAdapter, RunOptions, RunResult } from '../types/provider.js';
import type { RefinementResult } from '../orchestrator/refiner.js';

import { makeLlmPlanner } from './llm-planner.js';

function fakeAdapter(answer: string | (() => string)): ProviderAdapter {
  return {
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
}

const validPlan = JSON.stringify({
  version: 1,
  goal: 'TS + React TODO app',
  tasks: [
    {
      id: 't-create',
      role: 'coder',
      goal: 'Implement create-task UI + persistence',
      prompt: 'Build the input + Enter handler that writes to SQLite.',
      dependsOn: [],
      acceptanceCriteria: ['empty input rejected', 'task persists to SQLite'],
      capabilitiesNeeded: ['file-edit'],
    },
    {
      id: 't-test',
      role: 'tester',
      goal: 'Add a smoke test',
      prompt: 'Write a vitest that creates a task and reads it back.',
      dependsOn: ['t-create'],
      acceptanceCriteria: ['vitest run passes'],
      capabilitiesNeeded: ['file-edit'],
    },
  ],
  createdAt: '2026-04-28T00:00:00.000Z',
});

const refinement: RefinementResult = {
  enrichedGoal: 'TS + React TODO app',
  assumptions: ['single-user'],
  questions: [],
  ready: true,
  prd: {
    overview: 'Local TODO app.',
    goals: ['create task fast'],
    userStories: [
      {
        id: 'US-001',
        title: 'Create',
        description: 'As a user, I want to type and press Enter so it saves.',
        acceptanceCriteria: ['empty rejected'],
      },
    ],
    nonGoals: [],
    successMetrics: ['tests pass'],
  },
  mvp: {
    pitch: 'Offline-first.',
    features: ['add', 'toggle done'],
    deferred: ['auth'],
    scope: '~3 days',
  },
};

describe('makeLlmPlanner', () => {
  it('parses a well-formed plan and returns it', async () => {
    const adapter = fakeAdapter(validPlan);
    const planner = makeLlmPlanner({ adapter });
    const plan = await planner({ rawGoal: 'todo app', refinement });
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]?.id).toBe('t-create');
    expect(plan.tasks[1]?.dependsOn).toEqual(['t-create']);
  });

  it('strips markdown fences before parsing', async () => {
    const fenced = '```json\n' + validPlan + '\n```';
    const adapter = fakeAdapter(fenced);
    const planner = makeLlmPlanner({ adapter });
    const plan = await planner({ rawGoal: 'todo app', refinement });
    expect(plan.tasks).toHaveLength(2);
  });

  it('stamps createdAt when the LLM omits it', async () => {
    const noTimestamp = JSON.stringify({
      version: 1,
      goal: 'x',
      tasks: [
        {
          id: 't1',
          role: 'coder',
          goal: 'do x',
          prompt: 'do x',
          dependsOn: [],
          acceptanceCriteria: ['x exists'],
          capabilitiesNeeded: [],
        },
      ],
    });
    const adapter = fakeAdapter(noTimestamp);
    const planner = makeLlmPlanner({ adapter });
    const plan = await planner({ rawGoal: 'x' });
    expect(plan.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('retries once on parse failure with a corrective hint', async () => {
    let calls = 0;
    const adapter = fakeAdapter(() => {
      calls += 1;
      return calls === 1 ? 'not json at all' : validPlan;
    });
    const planner = makeLlmPlanner({ adapter, maxParseRetries: 1 });
    const plan = await planner({ rawGoal: 'todo app', refinement });
    expect(calls).toBe(2);
    expect(plan.tasks).toHaveLength(2);
  });

  it('falls back to a single-task stub when retries exhausted', async () => {
    const adapter = fakeAdapter('still not a plan');
    const planner = makeLlmPlanner({ adapter, maxParseRetries: 1 });
    const plan = await planner({ rawGoal: 'build a todo app', refinement });
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]?.role).toBe('coder');
    expect(plan.tasks[0]?.prompt).toMatch(/build a todo app|TS \+ React TODO/);
  });

  it('rejects a plan with a dependency cycle (PlanSchema enforces)', async () => {
    const cyclic = JSON.stringify({
      version: 1,
      goal: 'x',
      tasks: [
        {
          id: 'a',
          role: 'coder',
          goal: 'a',
          prompt: 'a',
          dependsOn: ['b'],
          acceptanceCriteria: ['x'],
          capabilitiesNeeded: [],
        },
        {
          id: 'b',
          role: 'coder',
          goal: 'b',
          prompt: 'b',
          dependsOn: ['a'],
          acceptanceCriteria: ['x'],
          capabilitiesNeeded: [],
        },
      ],
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    let calls = 0;
    const adapter = fakeAdapter(() => {
      calls += 1;
      return cyclic;
    });
    const planner = makeLlmPlanner({ adapter, maxParseRetries: 0 });
    const plan = await planner({ rawGoal: 'x' });
    // Cycle rejected by PlanSchema, falls back to stub.
    expect(plan.tasks).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('includes the PRD JSON in the user prompt', async () => {
    const adapter = fakeAdapter(validPlan);
    const planner = makeLlmPlanner({ adapter });
    await planner({ rawGoal: 'todo app', refinement });
    const runMock = adapter.run as unknown as ReturnType<typeof vi.fn>;
    const args = runMock.mock.calls[0]?.[0] as RunOptions;
    expect(args.prompt).toMatch(/PRD/);
    expect(args.prompt).toMatch(/US-001/);
    expect(args.prompt).toMatch(/MVP/);
  });

  it('omits PRD/MVP from prompt when refinement is undefined', async () => {
    const adapter = fakeAdapter(validPlan);
    const planner = makeLlmPlanner({ adapter });
    await planner({ rawGoal: 'todo app' });
    const runMock = adapter.run as unknown as ReturnType<typeof vi.fn>;
    const args = runMock.mock.calls[0]?.[0] as RunOptions;
    expect(args.prompt).not.toMatch(/PRD:/);
    expect(args.prompt).not.toMatch(/MVP:/);
  });
});
