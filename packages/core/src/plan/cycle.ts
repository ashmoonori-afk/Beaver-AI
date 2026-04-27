// DAG cycle detection over a Task-like list.
// Standard DFS coloring (white/gray/black) with a parent map to reconstruct
// the cycle path on the first back-edge found.
//
// Defined against the structural minimum (`TaskNode`) so this file does not
// depend on plan/schema.ts — that one-way dependency lets schema.ts call
// findPlanCycle from inside its superRefine without creating a cycle.

type Color = 'white' | 'gray' | 'black';

/** Structural minimum a task needs to participate in cycle detection. */
export interface TaskNode {
  id: string;
  dependsOn: ReadonlyArray<string>;
}

/**
 * Returns the first dependency cycle as a list of task ids
 * (first id repeated at the end), or null if the graph is acyclic.
 *
 * Tasks that reference unknown ids are skipped — that case is a separate
 * validation concern and is handled by `PlanSchema.superRefine`.
 */
export function findPlanCycle(tasks: ReadonlyArray<TaskNode>): string[] | null {
  const adj = new Map<string, string[]>();
  for (const t of tasks) adj.set(t.id, [...t.dependsOn]);

  const color = new Map<string, Color>();
  for (const id of adj.keys()) color.set(id, 'white');
  const parent = new Map<string, string>();

  function dfs(u: string): string[] | null {
    color.set(u, 'gray');
    for (const v of adj.get(u) ?? []) {
      if (!adj.has(v)) continue; // unknown dep — separate validation
      const c = color.get(v);
      if (c === 'gray') {
        const cycle: string[] = [v];
        let cur: string | undefined = u;
        while (cur && cur !== v) {
          cycle.push(cur);
          cur = parent.get(cur);
        }
        cycle.push(v);
        return cycle.reverse();
      }
      if (c === 'white') {
        parent.set(v, u);
        const found = dfs(v);
        if (found) return found;
      }
    }
    color.set(u, 'black');
    return null;
  }

  for (const id of adj.keys()) {
    if (color.get(id) === 'white') {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}
