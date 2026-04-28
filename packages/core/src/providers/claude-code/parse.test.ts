import { describe, it, expect } from 'vitest';

import { parseLine, toAgentEvent } from './parse.js';
import type { ClaudeStreamEvent } from './protocol.js';

describe('parseLine', () => {
  it('parses each known stream event type', () => {
    expect(parseLine('{"type":"message_delta","text":"hi"}')).toMatchObject({
      type: 'message_delta',
      text: 'hi',
    });
    expect(parseLine('{"type":"tool_use","name":"shell","input":{"cmd":"ls"}}')).toMatchObject({
      type: 'tool_use',
      name: 'shell',
    });
    expect(parseLine('{"type":"tool_result","name":"shell","output":"x"}')).toMatchObject({
      type: 'tool_result',
      name: 'shell',
    });
    expect(parseLine('{"type":"usage","tokensIn":1,"tokensOut":2,"model":"m"}')).toMatchObject({
      type: 'usage',
      tokensIn: 1,
      tokensOut: 2,
      model: 'm',
    });
    expect(parseLine('{"type":"stop"}')).toMatchObject({ type: 'stop' });
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

  it('lifts cache_read_input_tokens from a real Claude usage rollup (Phase 8)', () => {
    // Real Claude attaches usage to a final assistant message with no
    // text content (the lifter returns message_delta for content-bearing
    // turns; the rollup is its own event).
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [],
        model: 'claude-3-5-sonnet',
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 30 },
      },
    });
    const parsed = parseLine(line);
    expect(parsed).toMatchObject({
      type: 'usage',
      tokensIn: 100,
      tokensOut: 50,
      cachedInputTokens: 30,
      model: 'claude-3-5-sonnet',
    });
  });

  it('omits cachedInputTokens when the source has no cache field', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    const parsed = parseLine(line);
    expect(parsed).toMatchObject({ type: 'usage', tokensIn: 100, tokensOut: 50 });
    expect(parsed).not.toHaveProperty('cachedInputTokens');
  });
});

describe('toAgentEvent', () => {
  // Translation table: every variant of the discriminated union must
  // produce a non-empty Beaver event type. Writing one assertion per
  // variant doubles as the exhaustive-switch contract.
  const cases: ReadonlyArray<readonly [ClaudeStreamEvent, string]> = [
    [{ type: 'message_delta', text: 'x' }, 'agent.message'],
    [{ type: 'tool_use', name: 's', input: {} }, 'agent.tool.use'],
    [{ type: 'tool_result', name: 's', output: 'o' }, 'agent.tool.result'],
    [{ type: 'usage', tokensIn: 1, tokensOut: 2, model: 'm' }, 'agent.usage'],
    [{ type: 'stop' }, 'agent.stop'],
  ];

  it.each(cases)('translates %j → %s', (stream, expectedType) => {
    const ev = toAgentEvent(stream);
    expect(ev.type).toBe(expectedType);
    expect(typeof ev.ts).toBe('string');
    expect(ev.source).toBe('agent');
  });

  it('attaches the message text in payload', () => {
    const ev = toAgentEvent({ type: 'message_delta', text: 'hello' });
    expect(ev.payload).toEqual({ text: 'hello' });
  });

  it('honors a custom source', () => {
    const ev = toAgentEvent({ type: 'stop' }, 'agent-42');
    expect(ev.source).toBe('agent-42');
  });
});
