// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import App from './App.js';

beforeEach(() => {
  // Reset hash between tests so each starts on the default panel.
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
});

describe('<App />', () => {
  it('renders the header with brand + version', () => {
    render(<App />);
    expect(screen.getByText('Beaver')).toBeInTheDocument();
    expect(screen.getByText('v0.1')).toBeInTheDocument();
  });

  it('shows all 6 panel nav buttons', () => {
    render(<App />);
    for (const label of ['Status', 'Checkpoints', 'Plan', 'Logs', 'Review', 'Wiki']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('renders the default Status panel stub on first load', () => {
    render(<App />);
    expect(screen.getByText(/Status panel/)).toBeInTheDocument();
  });
});
