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

/** Try to parse one stdout line into a known stream event. */
export function parseLine(line: string): CodexStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const r = CodexStreamEventSchema.safeParse(raw);
  return r.success ? r.data : null;
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
