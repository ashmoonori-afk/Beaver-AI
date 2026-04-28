// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ErrorBanner } from './ErrorBanner.js';
import type { ClassifiedError } from '../lib/errorMessages.js';

afterEach(() => {
  cleanup();
});

const baseError: ClassifiedError = {
  kind: 'cli-missing',
  title: 'Beaver CLI is not installed',
  body: 'Install via pnpm add -g @beaver-ai/cli.',
  action: {
    label: 'Open install docs',
    intent: 'open-docs',
    href: 'https://example.test/install',
  },
};

describe('ErrorBanner', () => {
  it('renders the title and body and dispatches onAction with the intent', () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<ErrorBanner error={baseError} onAction={onAction} onDismiss={onDismiss} />);

    expect(screen.getByText(baseError.title)).toBeTruthy();
    expect(screen.getByText(baseError.body)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /open install docs/i }));
    expect(onAction).toHaveBeenCalledWith('open-docs');
    expect(openSpy).toHaveBeenCalledWith('https://example.test/install', '_blank', 'noopener');

    openSpy.mockRestore();
  });

  it('triggers onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<ErrorBanner error={baseError} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss error/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when error.action is absent', () => {
    const noActionError: ClassifiedError = {
      kind: 'goal-empty',
      title: 'Goal is empty',
      body: 'Type a goal and try again.',
    };
    render(<ErrorBanner error={noActionError} onDismiss={() => {}} />);
    // Only the dismiss button should be present.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Dismiss error');
  });

  it('emits role="alert" so screen readers announce it', () => {
    render(<ErrorBanner error={baseError} onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain(baseError.title);
  });
});
