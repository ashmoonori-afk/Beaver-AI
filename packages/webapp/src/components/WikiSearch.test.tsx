// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { WikiSearch } from './WikiSearch.js';
import type { AskWikiTransport } from '../hooks/useAskWiki.js';
import type { WikiAnswer } from '../types.js';

afterEach(() => {
  cleanup();
});

function transportWith(answer: WikiAnswer): AskWikiTransport {
  return {
    ask: vi.fn().mockResolvedValue(answer),
  };
}

describe('<WikiSearch />', () => {
  it('shows the empty-state copy on mount (idle)', () => {
    const transport = transportWith({ text: '', citations: [], empty: false });
    render(<WikiSearch transport={transport} debounceMs={0} />);
    expect(screen.getByTestId('wiki-empty-state')).toBeInTheDocument();
    expect(screen.getByLabelText('Ask the wiki')).toBeInTheDocument();
  });

  it('renders the answer + citations once the transport resolves', async () => {
    const transport = transportWith({
      text: 'Beaver decided X.',
      citations: [
        { path: 'runs/2026-04-21-billing.md', excerpt: 'flagged + ramped', truncated: false },
      ],
      empty: false,
    });
    render(<WikiSearch transport={transport} debounceMs={0} />);
    fireEvent.change(screen.getByLabelText('Ask the wiki'), {
      target: { value: 'what about billing?' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('wiki-answer')).toHaveTextContent('Beaver decided X.'),
    );
    expect(screen.getByTestId('citation-runs/2026-04-21-billing.md')).toBeInTheDocument();
  });

  it('shows the empty-wiki fallback without firing the LLM citation list', async () => {
    const transport = transportWith({ text: '', citations: [], empty: true });
    render(<WikiSearch transport={transport} debounceMs={0} />);
    fireEvent.change(screen.getByLabelText('Ask the wiki'), { target: { value: 'q' } });
    await waitFor(() => expect(screen.getByTestId('wiki-no-entry')).toBeInTheDocument());
    expect(screen.queryByTestId('wiki-citations')).toBeNull();
  });

  it('renders the (truncated) marker when a citation is clipped', async () => {
    const transport = transportWith({
      text: 'short answer',
      citations: [{ path: 'a.md', excerpt: 'clipped excerpt', truncated: true }],
      empty: false,
    });
    render(<WikiSearch transport={transport} debounceMs={0} />);
    fireEvent.change(screen.getByLabelText('Ask the wiki'), { target: { value: 'q' } });
    await waitFor(() => expect(screen.getByText('(truncated)')).toBeInTheDocument());
  });

  it('renders citation paths as plain text — no XSS via crafted filenames', async () => {
    const transport = transportWith({
      text: 'a',
      citations: [
        {
          path: '<script>alert(1)</script>.md',
          excerpt: '<img src=x onerror=alert(1)>',
          truncated: false,
        },
      ],
      empty: false,
    });
    const { container } = render(<WikiSearch transport={transport} debounceMs={0} />);
    fireEvent.change(screen.getByLabelText('Ask the wiki'), { target: { value: 'q' } });
    await waitFor(() => expect(screen.getByTestId('wiki-answer')).toBeInTheDocument());
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows an error toast when the transport rejects', async () => {
    const transport: AskWikiTransport = {
      ask: vi.fn().mockRejectedValue(new Error('network down')),
    };
    render(<WikiSearch transport={transport} debounceMs={0} />);
    fireEvent.change(screen.getByLabelText('Ask the wiki'), { target: { value: 'q' } });
    await waitFor(() => expect(screen.getByTestId('wiki-error')).toHaveTextContent('network down'));
  });
});
