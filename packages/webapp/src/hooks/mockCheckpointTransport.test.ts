import { describe, it, expect } from 'vitest';

import { makeMockCheckpointTransport } from './mockCheckpointTransport.js';
import type { CheckpointSummary } from '../types.js';

describe('makeMockCheckpointTransport', () => {
  it('emits a seeded list immediately on subscribe', () => {
    const transport = makeMockCheckpointTransport();
    const seen: readonly CheckpointSummary[][] = [];
    transport.subscribe('r-1', (list) => {
      (seen as CheckpointSummary[][]).push([...list]);
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.length).toBeGreaterThan(0);
    expect(seen[0]?.every((cp) => cp.runId === 'r-1')).toBe(true);
  });

  it('removes a checkpoint from the list after answer() resolves', async () => {
    const transport = makeMockCheckpointTransport();
    const seen: CheckpointSummary[][] = [];
    transport.subscribe('r-1', (list) => seen.push([...list]));
    const target = seen[0]![0]!;
    await transport.answer(target.id, 'approve');
    const last = seen.at(-1)!;
    expect(last.find((cp) => cp.id === target.id)).toBeUndefined();
  });

  it('rejects with an Error when answering an unknown id', async () => {
    const transport = makeMockCheckpointTransport();
    await expect(transport.answer('does-not-exist', 'approve')).rejects.toThrow(
      /no such checkpoint/i,
    );
  });

  it('stops emitting to a listener once its cleanup fn is called', () => {
    const transport = makeMockCheckpointTransport();
    const seen: CheckpointSummary[][] = [];
    const unsub = transport.subscribe('r-2', (list) => seen.push([...list]));
    unsub();
    const before = seen.length;
    void transport.answer(seen[0]![0]!.id, 'approve');
    expect(seen.length).toBe(before);
  });
});
