// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { HintLine } from './HintLine.js';

afterEach(() => {
  cleanup();
});

describe('<HintLine />', () => {
  it('renders the hint text and source pages', () => {
    render(
      <HintLine
        hint={{
          text: 'last similar plan blew the budget',
          sourcePages: ['runs/2026-04-21-billing.md'],
        }}
      />,
    );
    expect(screen.getByTestId('hint-line')).toHaveTextContent(/last similar plan/i);
    expect(screen.getByTestId('hint-line')).toHaveTextContent('runs/2026-04-21-billing.md');
  });

  it('omits the source page suffix when sourcePages is empty', () => {
    render(<HintLine hint={{ text: 'just a hint', sourcePages: [] }} />);
    const node = screen.getByTestId('hint-line');
    expect(node).toHaveTextContent('just a hint');
    expect(node).not.toHaveTextContent('·');
  });
});
