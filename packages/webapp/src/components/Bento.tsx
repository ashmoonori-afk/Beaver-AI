// Run-in-progress bento grid. 2x2 of headline cards + agents row below.
// CSS grid only — no library — per the locked stack.

import { AgentCard } from './AgentCard.js';
import { CostBreakdown } from './CostBreakdown.js';
import { CostTicker } from './CostTicker.js';
import { ElapsedClock } from './ElapsedClock.js';
import { StateBadge } from './StateBadge.js';
import type { CostBreakdownEntry, RunSnapshot } from '../types.js';

export interface BentoProps {
  snapshot: RunSnapshot;
  /** Phase 1-D — per-phase spend breakdown. Optional so existing tests
   *  that don't exercise this section still pass; the section is
   *  hidden when no entries are passed. */
  costBreakdown?: readonly CostBreakdownEntry[];
}

export function Bento({ snapshot, costBreakdown }: BentoProps) {
  return (
    <div data-testid="bento" className="mx-auto w-full max-w-5xl space-y-6 py-6">
      {/* headline 4-card row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <StateBadge state={snapshot.state} />
        </Card>
        <Card>
          <CostTicker
            spentUsd={snapshot.spentUsd}
            budgetUsd={snapshot.budgetUsd}
            {...(snapshot.tokens !== undefined && { tokens: snapshot.tokens })}
            {...(snapshot.tokenCap !== undefined && { tokenCap: snapshot.tokenCap })}
            {...(snapshot.costMode !== undefined && { costMode: snapshot.costMode })}
          />
        </Card>
        <Card>
          <ElapsedClock
            startedAt={snapshot.startedAt}
            state={snapshot.state}
            {...(snapshot.endedAt !== undefined && { endedAt: snapshot.endedAt })}
          />
        </Card>
        <Card>
          <div className="flex flex-col gap-1">
            <span className="text-caption text-text-500">Open checkpoints</span>
            <div className="text-hero text-text-50 font-mono">{snapshot.openCheckpoints}</div>
            <div className="text-caption text-text-500">
              {snapshot.openCheckpoints === 0 ? 'none' : 'awaiting input'}
            </div>
          </div>
        </Card>
      </div>

      {/* Phase 1-D: spend-by-phase breakdown. Hidden when the parent
          didn't wire a transport (browser-only tests). */}
      {costBreakdown ? <CostBreakdown entries={costBreakdown} /> : null}

      {/* agents row */}
      <section data-testid="agents-row" className="space-y-2">
        <h2 className="text-caption text-text-500">Agents</h2>
        {snapshot.agents.length === 0 ? (
          <p className="text-caption text-text-500">No agents have spawned yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.agents.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card bg-surface-800 px-4 py-3">{children}</div>;
}
