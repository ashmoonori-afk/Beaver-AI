// Phase 2-C — synchronous mock for the wiki browse UI in
// browser-dev mode and tests. Returns a small fixed seed so the
// section grouping + sort-by-modified order is exercised without
// any filesystem.

import type { WikiPagesTransport } from './useWikiPages.js';

export function makeMockWikiPagesTransport(): WikiPagesTransport {
  return {
    async list() {
      return {
        wikiPath: '/dev/null/.beaver/wiki',
        exists: true,
        pages: [
          {
            path: 'index.md',
            title: 'Beaver Wiki Index',
            section: '',
            modifiedAt: '2026-04-28T22:00:00.000Z',
            bytes: 412,
          },
          {
            path: 'decisions/2026-04-28-auth.md',
            title: 'Auth — picked OAuth2 with PKCE',
            section: 'decisions',
            modifiedAt: '2026-04-28T20:00:00.000Z',
            bytes: 1820,
          },
          {
            path: 'projects/billing.md',
            title: 'Billing service',
            section: 'projects',
            modifiedAt: '2026-04-26T16:30:00.000Z',
            bytes: 3204,
          },
          {
            path: 'patterns/repository.md',
            title: 'Repository pattern',
            section: 'patterns',
            modifiedAt: '2026-04-25T09:15:00.000Z',
            bytes: 2104,
          },
        ],
      };
    },
    async reveal() {
      // No-op in browser mode — the in-browser context can't open a
      // file manager. The Tauri transport is the real implementation.
    },
  };
}
