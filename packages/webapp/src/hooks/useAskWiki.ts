// Debounced wiki Q&A hook. Keeps the renderer ignorant of `askWiki` —
// the transport wraps it (server endpoint in 4D.2). Per the 4U.5
// spaghetti rule the hook never builds prompts itself.

import { useEffect, useState } from 'react';

import type { WikiAnswer } from '../types.js';

export interface AskWikiTransport {
  /** Resolve to an answer + citations for `question`. The transport
   *  decides when to short-circuit ("no relevant entry yet") and when
   *  to truncate excerpts. */
  ask(question: string, signal: AbortSignal): Promise<WikiAnswer>;
}

export type AskWikiState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; answer: WikiAnswer }
  | { status: 'error'; message: string };

export interface UseAskWikiOptions {
  /** Override the 250 ms debounce — tests pass 0 to skip. */
  debounceMs?: number;
}

const ERROR_MESSAGE_CAP = 200;

/** Cap server-side error messages before they reach the DOM so a
 *  leaked stack trace can't blow up the layout or smuggle long URLs. */
function safeMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'ask failed';
  if (raw.length <= ERROR_MESSAGE_CAP) return raw;
  return `${raw.slice(0, ERROR_MESSAGE_CAP)}…`;
}

export function useAskWiki(
  question: string,
  transport: AskWikiTransport,
  opts: UseAskWikiOptions = {},
): AskWikiState {
  const debounceMs = opts.debounceMs ?? 250;
  const [state, setState] = useState<AskWikiState>({ status: 'idle' });

  useEffect(() => {
    const trimmed = question.trim();
    if (trimmed.length === 0) {
      setState({ status: 'idle' });
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => {
      // Guard against the (rare) firing-after-cleanup race when the
      // debounce window collapses to 0 in tests + the parent unmounts
      // between scheduleTime and now.
      if (ac.signal.aborted) return;
      setState({ status: 'loading' });
      transport
        .ask(trimmed, ac.signal)
        .then((answer) => {
          if (ac.signal.aborted) return;
          setState({ status: 'ready', answer });
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          setState({ status: 'error', message: safeMessage(err) });
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [question, transport, debounceMs]);

  return state;
}
