// Checkpoint integration glue.
//
// Phase 3 owns `packages/core/src/feedback/wiki-query.ts` (the WikiQuery
// interface used by checkpoint.ts). This file does NOT touch that module —
// instead it exposes a small adapter factory the orchestrator can wire in
// when it constructs a checkpoint with a real wiki present.
//
// Deliberately decoupled: this file imports only from `./query.js` and the
// adapter contract; it does not import anything from `../feedback/`. The
// orchestrator is the place that decides whether to use the real wiki
// query or Phase 3's noop stub.

import type { ProviderAdapter } from '../types/provider.js';

import { queryWiki, type QueryWikiResult } from './query.js';

export interface WikiQueryFn {
  (kind: string, context: Record<string, unknown>): Promise<QueryWikiResult>;
}

/**
 * Build a closure the orchestrator's checkpoint module can call as a
 * structured wiki hint provider. The factory binds wikiRoot + adapter so
 * call-sites stay narrow (kind, context).
 */
export function wikiQueryFor(wikiRoot: string, adapter: ProviderAdapter): WikiQueryFn {
  return (kind, context) => queryWiki({ wikiRoot, kind, context, adapter });
}
