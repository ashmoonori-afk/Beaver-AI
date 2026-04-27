// Translate Claude Code's structured stream events into Beaver's
// canonical AgentEvent shape.
//
// The translation is a `switch` on the discriminated union (per P1.S2
// spaghetti rule: no string-typing of event kinds). Lines that do not
// parse as a known ClaudeStreamEvent — including the mock CLI's
// {"kind":"final",...} terminator — are returned as `null` so the
// caller can decide what to do with them.
//
// In production (`claude --print --output-format stream-json --verbose`)
// the real CLI emits events like {type:'system',subtype:'init',...},
// {type:'assistant',message:{content:[{type:'text',text:'...'}],usage:
// {input_tokens,output_tokens}}}, and {type:'result',subtype:'success',
// total_cost_usd, result, usage}. `parseLine` lifts the relevant fields
// from those shapes into our internal mock-style stream events
// (message_delta + usage + stop) so downstream code does not need to
// know the wire difference.

import type { AgentEvent } from '../../types/event.js';

import { ClaudeStreamEventSchema, type ClaudeStreamEvent } from './protocol.js';

/** Try to parse one stdout line into a known stream event. */
export function parseLine(line: string): ClaudeStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  // First: our internal/mock-cli protocol.
  const internal = ClaudeStreamEventSchema.safeParse(raw);
  if (internal.success) return internal.data;

  // Second: real Claude Code stream-json output. Lift the bits we use.
  if (raw !== null && typeof raw === 'object') {
    const lifted = liftRealClaudeEvent(raw as Record<string, unknown>);
    if (lifted) return lifted;
  }
  return null;
}

interface ClaudeRealAssistantContent {
  type?: string;
  text?: string;
}
interface ClaudeRealUsage {
  input_tokens?: number;
  output_tokens?: number;
}
interface ClaudeRealAssistantMessage {
  content?: ClaudeRealAssistantContent[];
  model?: string;
  usage?: ClaudeRealUsage;
}

function liftRealClaudeEvent(raw: Record<string, unknown>): ClaudeStreamEvent | null {
  const t = raw.type;
  // assistant message: collect text deltas + per-turn usage
  if (t === 'assistant' && typeof raw.message === 'object' && raw.message !== null) {
    const msg = raw.message as ClaudeRealAssistantMessage;
    const text = (msg.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('');
    if (text.length > 0) return { type: 'message_delta', text };
    return null;
  }
  // result event: final response + cost. Surfaces error subtypes verbatim
  // so api.ts fallback logic can match "usage limit" / "rate limit" etc.
  if (t === 'result') {
    const isError =
      raw.is_error === true || (typeof raw.subtype === 'string' && raw.subtype.startsWith('error'));
    if (isError) {
      const reason =
        typeof raw.result === 'string'
          ? raw.result
          : typeof raw.subtype === 'string'
            ? raw.subtype
            : 'unknown error';
      return { type: 'message_delta', text: `[claude error] ${reason}` };
    }
    if (typeof raw.result === 'string') {
      return { type: 'message_delta', text: raw.result };
    }
  }
  // usage rollup attached to assistant.message — lift if input/output present
  if (
    t === 'assistant' &&
    typeof raw.message === 'object' &&
    raw.message !== null &&
    typeof (raw.message as ClaudeRealAssistantMessage).usage === 'object'
  ) {
    const u = (raw.message as ClaudeRealAssistantMessage).usage as ClaudeRealUsage;
    if (typeof u.input_tokens === 'number' && typeof u.output_tokens === 'number') {
      return {
        type: 'usage',
        tokensIn: u.input_tokens,
        tokensOut: u.output_tokens,
        model:
          typeof (raw.message as ClaudeRealAssistantMessage).model === 'string'
            ? ((raw.message as ClaudeRealAssistantMessage).model as string)
            : 'claude',
      };
    }
  }
  // system/init or other meta events: ignore quietly
  return null;
}

/** Map a parsed stream event to an AgentEvent ready for the event bus. */
export function toAgentEvent(e: ClaudeStreamEvent, source = 'agent'): AgentEvent {
  const ts = new Date().toISOString();
  switch (e.type) {
    case 'message_delta':
      return { ts, source, type: 'agent.message', payload: { text: e.text } };
    case 'tool_use':
      return { ts, source, type: 'agent.tool.use', payload: { name: e.name, input: e.input } };
    case 'tool_result':
      return {
        ts,
        source,
        type: 'agent.tool.result',
        payload: { name: e.name, output: e.output, isError: e.isError ?? false },
      };
    case 'usage':
      return {
        ts,
        source,
        type: 'agent.usage',
        payload: { tokensIn: e.tokensIn, tokensOut: e.tokensOut, model: e.model },
      };
    case 'stop':
      return { ts, source, type: 'agent.stop', payload: { reason: e.reason ?? 'end' } };
  }
}
