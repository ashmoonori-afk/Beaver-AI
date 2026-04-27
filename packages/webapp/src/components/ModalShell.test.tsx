// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import '@testing-library/jest-dom/vitest';

import { ModalShell } from './ModalShell.js';

afterEach(() => {
  cleanup();
});

describe('<ModalShell />', () => {
  it('renders children inside the role=dialog body', () => {
    render(
      <ModalShell titleId="t" onClose={vi.fn()} testId="m">
        <h3 id="t">Hello</h3>
      </ModalShell>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('wires aria-labelledby to the supplied titleId', () => {
    render(
      <ModalShell titleId="t" onClose={vi.fn()}>
        <h3 id="t">Title</h3>
      </ModalShell>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 't');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ModalShell titleId="t" onClose={onClose}>
        <h3 id="t">x</h3>
      </ModalShell>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click but not on body click', () => {
    const onClose = vi.fn();
    render(
      <ModalShell titleId="t" onClose={onClose} testId="m">
        <h3 id="t">title</h3>
      </ModalShell>,
    );
    fireEvent.click(screen.getByText('title'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('m'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the supplied initialFocusRef on mount', () => {
    function Harness() {
      const btn = useRef<HTMLButtonElement>(null);
      return (
        <ModalShell titleId="t" onClose={vi.fn()} initialFocusRef={btn}>
          <h3 id="t">x</h3>
          <button ref={btn} type="button">
            target
          </button>
        </ModalShell>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'target' })).toHaveFocus();
  });
});
