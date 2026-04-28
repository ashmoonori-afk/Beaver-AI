import { describe, it, expect } from 'vitest';

import { parseLine, toAgentEvent } from './parse.js';
import type { CodexStreamEvent } from './protocol.js';

describe('parseLine', () => {
  it('parses each known stream event type', () => {
    expect(parseLine('{"type":"output_delta","text":"hi"}')).toMatchObject({
      type: 'output_delta',
      text: 'hi',
    });
    expect(parseLine('{"type":"tool_call","name":"shell","arguments":{"cmd":"ls"}}')).toMatchObject(
      { type: 'tool_call', name: 'shell' },
    );
    expect(parseLine('{"type":"tool_output","name":"shell","content":"x"}')).toMatchObject({
      type: 'tool_output',
      name: 'shell',
    });
    expect(parseLine('{"type":"usage","tokensIn":1,"tokensOut":2,"model":"m"}')).toMatchObject({
      type: 'usage',
      tokensIn: 1,
      tokensOut: 2,
      model: 'm',
    });
    expect(parseLine('{"type":"done"}')).toMatchObject({ type: 'done' });
  });

  it('returns null for non-JSON lines', () => {
    expect(parseLine('not json at all')).toBeNull();
  });

  it('returns null for unknown event types (forward-compat with richer real CLI)', () => {
    expect(parseLine('{"type":"some_future_event","x":1}')).toBeNull();
  });

  it('returns null for the mock-cli {"kind":"final",...} terminator', () => {
    expect(parseLine('{"kind":"final","result":{}}')).toBeNull();
  });

  it('lifts cached_input_tokens from a real Codex token_count event (Phase 8)', () => {
    const line = JSON.stringify({
      msg: {
        type: 'token_count',
        input_tokens: 100,
        output_tokens: 50,
        cached_input_tokens: 30,
      },
    });
    expect(parseLine(line)).toMatchObject({
      type: 'usage',
      tokensIn: 100,
      tokensOut: 50,
      cachedInputTokens: 30,
    });
  });

  it('also lifts prompt_tokens_details.cached_tokens (alternate Codex shape)', () => {
    const line = JSON.stringify({
      msg: {
        type: 'token_count',
        input_tokens: 100,
        output_tokens: 50,
        prompt_tokens_details: { cached_tokens: 25 },
      },
    });
    expect(parseLine(line)).toMatchObject({
      type: 'usage',
      tokensIn: 100,
      tokensOut: 50,
      cachedInputTokens: 25,
    });
  });
});

describe('toAgentEvent', () => {
  // Translation table: every variant of the discriminated union must
  // produce a non-empty Beaver event type. Writing one assertion per
  // variant doubles as the exhaustive-switch contract.
  const cases: ReadonlyArray<readonly [CodexStreamEvent, string]> = [
    [{ type: 'output_delta', text: 'x' }, 'agent.message'],
    [{ type: 'tool_call', name: 's', arguments: {} }, 'agent.tool.use'],
    [{ type: 'tool_output', name: 's', content: 'o' }, 'agent.tool.result'],
    [{ type: 'usage', tokensIn: 1, tokensOut: 2, model: 'm' }, 'agent.usage'],
    [{ type: 'done' }, 'agent.stop'],
  ];

  it.each(cases)('translates %j → %s', (stream, expectedType) => {
    const ev = toAgentEvent(stream);
    expect(ev.type).toBe(expectedType);
    expect(typeof ev.ts).toBe('string');
    expect(ev.source).toBe('agent');
  });

  it('attaches the message text in payload', () => {
    const ev = toAgentEvent({ type: 'output_delta', text: 'hello' });
    expect(ev.payload).toEqual({ text: 'hello' });
  });

  it('maps tool_call.arguments → payload.input', () => {
    const ev = toAgentEvent({ type: 'tool_call', name: 'shell', arguments: { cmd: 'ls' } });
    expect(ev.payload).toEqual({ name: 'shell', input: { cmd: 'ls' } });
  });

  it('maps tool_output.content → payload.output and defaults isError=false', () => {
    const ev = toAgentEvent({ type: 'tool_output', name: 'shell', content: 'ok' });
    expect(ev.payload).toEqual({ name: 'shell', output: 'ok', isError: false });
  });

  it('honors a custom source', () => {
    const ev = toAgentEvent({ type: 'done' }, 'agent-42');
    expect(ev.source).toBe('agent-42');
  });
});
