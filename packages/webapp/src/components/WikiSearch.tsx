// #wiki panel — single textarea + citation list. Calls askWiki via an
// injectable transport (server endpoint in 4D.2). Empty wiki short-
// circuits in the transport so the renderer never fires the LLM in
// that case. Citations render the path + excerpt as plain text;
// truncation is shown as "(truncated)" not raw clipped JSON.

import { useState } from 'react';

import type { AskWikiTransport, AskWikiState } from '../hooks/useAskWiki.js';
import { useAskWiki } from '../hooks/useAskWiki.js';
import type { WikiCitation } from '../types.js';

const EMPTY_COPY = "Beaver remembers your past runs. Try 'what did we decide last about auth?'";

export interface WikiSearchProps {
  transport: AskWikiTransport;
  /** Test seam: skip the 250 ms debounce when set to 0. */
  debounceMs?: number;
}

export function WikiSearch({ transport, debounceMs }: WikiSearchProps) {
  const [question, setQuestion] = useState('');
  const state = useAskWiki(question, transport, debounceMs !== undefined ? { debounceMs } : {});
  return (
    <section data-testid="wiki-panel" className="mx-auto w-full max-w-3xl space-y-4 py-6">
      <header>
        <label htmlFor="wiki-question" className="sr-only">
          Ask the wiki
        </label>
        <textarea
          id="wiki-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Ask the wiki anything…"
          className="w-full rounded-card bg-surface-800 px-4 py-3 text-body text-text-50 placeholder:text-text-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        />
      </header>
      <Answer state={state} />
    </section>
  );
}

function Answer({ state }: { state: AskWikiState }) {
  if (state.status === 'idle') {
    return (
      <p data-testid="wiki-empty-state" className="text-caption text-text-500">
        {EMPTY_COPY}
      </p>
    );
  }
  if (state.status === 'loading') {
    return (
      <p data-testid="wiki-loading" className="text-caption text-text-500" aria-live="polite">
        Searching the wiki…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" data-testid="wiki-error" className="text-caption text-danger-500">
        {state.message}
      </p>
    );
  }
  const { answer } = state;
  if (answer.empty) {
    return (
      <p data-testid="wiki-no-entry" className="text-caption text-text-500">
        No relevant entry yet. Beaver will start citing once you've completed a few runs.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p data-testid="wiki-answer" className="text-body text-text-300 whitespace-pre-wrap">
        {answer.text}
      </p>
      <CitationList citations={answer.citations} />
    </div>
  );
}

function CitationList({ citations }: { citations: readonly WikiCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <ul data-testid="wiki-citations" className="space-y-2">
      {citations.map((c) => (
        <li
          key={c.path}
          data-testid={`citation-${c.path}`}
          className="rounded-card bg-surface-800 px-4 py-3"
        >
          <p className="text-caption text-text-500 font-mono">{c.path}</p>
          <p className="text-body text-text-300 whitespace-pre-wrap">{c.excerpt}</p>
          {c.truncated ? <p className="text-caption text-text-500 italic">(truncated)</p> : null}
        </li>
      ))}
    </ul>
  );
}
