import { beforeEach, describe, expect, it } from 'vitest';

import type { EventRow } from '@beaver-ai/core';

import { setColorOverride, stripAnsi } from '../colors.js';
import { renderLogLine, renderLogs } from '../logs.js';

beforeEach(() => setColorOverride(false));

const ROWS: EventRow[] = [
  {
    id: 1,
    run_id: 'r1',
    ts: '2026-04-27T10:11:12Z',
    source: 'orchestrator',
    type: 'state',
    payload_json: JSON.stringify({ message: 'EXECUTING' }),
  },
  {
    id: 2,
    run_id: 'r1',
    ts: '2026-04-27T10:11:13Z',
    source: 'agent',
    type: 'tool',
    payload_json: JSON.stringify({ message: 'wrote hello.txt' }),
  },
];

describe('renderLogs', () => {
  it('pretty mode emits HH:MM:SS source type · message', () => {
    expect(stripAnsi(renderLogLine(ROWS[0]!))).toBe('10:11:12 orchestrator state · EXECUTING');
  });

  it('json mode round-trips through JSON.parse', () => {
    const out = renderLogs(ROWS, { json: true });
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const parsed: unknown = JSON.parse(line);
      expect(parsed).toMatchObject({ run_id: 'r1' });
    }
  });

  it('handles missing payload gracefully', () => {
    const row: EventRow = { ...ROWS[0]!, payload_json: null };
    expect(stripAnsi(renderLogLine(row))).toBe('10:11:12 orchestrator state · ');
  });
});
