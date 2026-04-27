// Italic muted line above a CheckpointCard, sourced from the wiki.
// Phase 5 supplies the hint via askWiki; W.4 surfaces it but does not
// fetch it — the caller decides whether a hint is present.

import type { CheckpointHint } from '../types.js';

export function HintLine({ hint }: { hint: CheckpointHint }) {
  return (
    <p
      className="text-caption text-text-300 italic"
      data-testid="hint-line"
      aria-label={`Wiki hint: ${hint.text}`}
    >
      <span aria-hidden>[hint] </span>
      {hint.text}
      {hint.sourcePages.length > 0 ? (
        <span className="text-text-500"> · {hint.sourcePages.join(', ')}</span>
      ) : null}
    </p>
  );
}
