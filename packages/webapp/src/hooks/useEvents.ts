// Streaming event hook for the #logs panel. Accumulates events into an
// internal append-only buffer. Replaces nothing, never re-orders — order
// is whatever the transport yields. Mock transport in W.5; the real
// Tauri bus subscriber lands in 4D.2.

import { useEffect, useState } from 'react';

import type { LogEvent } from '../types.js';

export interface EventsTransport {
  /** Subscribe to a stream of new events. Each call emits zero or more
   *  events; the hook concatenates them into a single ordered buffer. */
  subscribe(runId: string, onEvent: (event: LogEvent) => void): () => void;
}

export function useEvents(runId: string | null, transport: EventsTransport): readonly LogEvent[] {
  const [events, setEvents] = useState<readonly LogEvent[]>([]);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      return;
    }
    setEvents([]);
    const unsub = transport.subscribe(runId, (e) => {
      setEvents((prev) => [...prev, e]);
    });
    return unsub;
  }, [runId, transport]);

  return events;
}
