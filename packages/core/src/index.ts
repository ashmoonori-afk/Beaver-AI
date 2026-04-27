// @beaver-ai/core public surface.
//
// Single barrel. No alias renames (P0.S2 spaghetti rule) so the source
// module of each name remains visible at the import site.

// types/
export * from './types/usage.js';
export * from './types/budget.js';
export * from './types/artifact.js';
export * from './types/event.js';
export * from './types/tool.js';
export * from './types/provider.js';

// plan/
export * from './plan/schema.js';
export * from './plan/cycle.js';

// budget/
export * from './budget/schema.js';

// agent-runtime/
export * from './agent-runtime/schema.js';
export * from './agent-runtime/lifecycle.js';
export * from './agent-runtime/worktree.js';

// agent-baseline/
export * from './agent-baseline/render.js';
export * from './agent-baseline/write-to-worktree.js';

// orchestrator/
export * from './orchestrator/fsm.js';
export * from './orchestrator/loop.js';
export * as decisions from './orchestrator/decisions/index.js';

// sandbox/
export * from './sandbox/patterns.js';
export * from './sandbox/classify.js';

// budget/cost (rate_table -> USD helper)
export * from './budget/cost.js';

// providers/_shared/
export * from './providers/_shared/spawn.js';
export * from './providers/_shared/kill.js';

// providers/claude-code/
// Per-provider parse + protocol live under namespaces to disambiguate
// `parseLine` / `toAgentEvent` (each provider exports its own).
export * as claudeCodeProtocol from './providers/claude-code/protocol.js';
export * as claudeCodeParse from './providers/claude-code/parse.js';
export * from './providers/claude-code/adapter.js';
export * from './providers/claude-code/hook-core.js';
export * from './providers/claude-code/hook-install.js';

// providers/codex/
export * as codexProtocol from './providers/codex/protocol.js';
export * as codexParse from './providers/codex/parse.js';
export * from './providers/codex/adapter.js';
export * from './providers/codex/shim-install.js';
export * from './providers/codex/audit.js';

// feedback/ (checkpoint primitive + wiki query indirection)
export * from './feedback/checkpoint.js';
export * from './feedback/wiki-query.js';

// wiki/
export * from './wiki/bootstrap.js';
export * from './wiki/ingest.js';
export * from './wiki/query.js';
export * from './wiki/checkpoint-hook.js';

// workspace/ (SQLite ledger)
export * from './workspace/db.js';
export * from './workspace/migrate.js';
export * from './workspace/dao/projects.js';
export * from './workspace/dao/runs.js';
export * from './workspace/dao/plans.js';
export * from './workspace/dao/tasks.js';
export * from './workspace/dao/agents.js';
export * from './workspace/dao/events.js';
export * from './workspace/dao/checkpoints.js';
export * from './workspace/dao/costs.js';
export * from './workspace/dao/rate_table.js';
