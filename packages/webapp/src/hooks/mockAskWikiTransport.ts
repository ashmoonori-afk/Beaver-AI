// In-memory askWiki transport for the W.6 demo + tests. Returns canned
// answers with one citation; `ASK_EMPTY_HINT` returns the empty-wiki
// fallback. Excerpts longer than 200 chars come back with `truncated: true`.

import type { AskWikiTransport } from './useAskWiki.js';
import type { WikiAnswer } from '../types.js';

const EMPTY_HINT = /^empty/i;
const EXCERPT_CAP = 200;

function clip(s: string): { text: string; truncated: boolean } {
  if (s.length <= EXCERPT_CAP) return { text: s, truncated: false };
  return { text: s.slice(0, EXCERPT_CAP), truncated: true };
}

export function makeMockAskWikiTransport(): AskWikiTransport {
  return {
    async ask(question, _signal) {
      if (EMPTY_HINT.test(question)) {
        return {
          text: '',
          citations: [],
          empty: true,
        } satisfies WikiAnswer;
      }
      const excerpt = `Decision: ${question} → ship behind a feature flag, ramp 5% / 25% / 100%.`;
      const clipped = clip(excerpt);
      return {
        text: `Last similar decision was logged in runs/2026-04-21-billing.md — flagged + ramped.`,
        citations: [
          {
            path: 'runs/2026-04-21-billing.md',
            excerpt: clipped.text,
            truncated: clipped.truncated,
          },
        ],
        empty: false,
      };
    },
  };
}
