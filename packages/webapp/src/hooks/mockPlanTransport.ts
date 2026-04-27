// In-memory plan list for the W.5 demo + tests. Seeds two versions
// (latest first) so the dropdown is exercised without any orchestrator
// wiring. Replaced by the Tauri transport in 4D.2.

import type { PlanSummary, PlanTask } from '../types.js';
import type { PlanListTransport } from './usePlanList.js';

function defaultTasks(version: number): PlanTask[] {
  if (version === 1) {
    return [
      { id: 't1', agentRole: 'planner', title: 'Sketch the data model' },
      { id: 't2', agentRole: 'coder', title: 'Scaffold /api/users', dependsOn: ['t1'] },
    ];
  }
  return [
    { id: 't1', agentRole: 'planner', title: 'Sketch the data model' },
    { id: 't2', agentRole: 'coder', title: 'Scaffold /api/users', dependsOn: ['t1'] },
    {
      id: 't3',
      agentRole: 'tester',
      title: 'Add a smoke test for the new route',
      dependsOn: ['t2'],
    },
  ];
}

export function makeMockPlanTransport(): PlanListTransport {
  return {
    subscribe(runId, onList) {
      const now = new Date().toISOString();
      const list: PlanSummary[] = [
        { id: `${runId}-plan-2`, runId, version: 2, createdAt: now, tasks: defaultTasks(2) },
        { id: `${runId}-plan-1`, runId, version: 1, createdAt: now, tasks: defaultTasks(1) },
      ];
      onList(list);
      return () => {};
    },
  };
}
