// Translate the Codex CLI's structured stream events into Beaver's
// canonical AgentEvent shape.
//
// The translation is a `switch` on the discriminated union (per P1.S2
// spaghetti rule: no string-typing of event kinds). Lines that do not
// parse as a known CodexStreamEvent — including the mock CLI's
// {"kind":"final",...} terminator — are returned as `null` so the
// caller can decide what to do with them.

import type { AgentEvent } from '../../types/event.js';

import { CodexStreamEventSchema, type CodexStreamEvent } from './protocol.js';

/** Try to parse one stdout line into a known stream event.
 *  Falls back to lifting real `codex exec --json` events (msg.type
 *  ∈ {'agent_message', 'task_complete', 'token_count'}) into the
 *  internal CodexStreamEvent shape so the adapter loop is uniform. */
export function parseLine(line: string): CodexStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const internal = CodexStreamEventSchema.safeParse(raw);
  if (internal.success) return internal.data;
  if (raw !== null && typeof raw === 'object') {
    const lifted = liftRealCodexEvent(raw as Record<string, unknown>);
    if (lifted) return lifted;
  }
  return null;
}

interface CodexRealMsg {
  type?: string;
  message?: string;
  text?: string;
  last_agent_message?: string;
  input_tokens?: number;
  output_tokens?: number;
}

function liftRealCodexEvent(raw: Record<string, unknown>): CodexStreamEvent | null {
  // codex exec --json wraps each event payload under `msg`.
  const msg = (raw.msg ?? raw) as CodexRealMsg;
  const t = msg.type;
  if (t === 'agent_message' && (typeof msg.message === 'string' || typeof msg.text === 'string')) {
    return { type: 'output_delta', text: (msg.message ?? msg.text ?? '') as string };
  }
  if (t === 'task_complete' && typeof msg.last_agent_message === 'string') {
    return { type: 'output_delta', text: msg.last_agent_message };
  }
  if (
    t === 'token_count' &&
    typeof msg.input_tokens === 'number' &&
    typeof msg.output_tokens === 'number'
  ) {
    return {
      type: 'usage',
      tokensIn: msg.input_tokens,
      tokensOut: msg.output_tokens,
      model: 'codex',
    };
  }
  return null;
}

/** Map a parsed stream event to an AgentEvent ready for the event bus. */
export function toAgentEvent(e: CodexStreamEvent, source = 'agent'): AgentEvent {
  const ts = new Date().toISOString();
  switch (e.type) {
    case 'output_delta':
      return { ts, source, type: 'agent.message', payload: { text: e.text } };
    case 'tool_call':
      return {
        ts,
        source,
        type: 'agent.tool.use',
        payload: { name: e.name, input: e.arguments },
      };
    case 'tool_output':
      return {
        ts,
        source,
        type: 'agent.tool.result',
        payload: { name: e.name, output: e.content, isError: e.isError ?? false },
      };
    case 'usage':
      return {
        ts,
        source,
        type: 'agent.usage',
        payload: { tokensIn: e.tokensIn, tokensOut: e.tokensOut, model: e.model },
      };
    case 'done':
      return { ts, source, type: 'agent.stop', payload: { reason: e.reason ?? 'end' } };
  }
}
