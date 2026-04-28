// @vitest-environment jsdom

import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceBanner } from './WorkspaceBanner.js';

afterEach(() => {
  cleanup();
});

describe('WorkspaceBanner', () => {
  describe('chip variant', () => {
    it('renders "No project" CTA when path is null and triggers pick', () => {
      const onPick = vi.fn();
      render(
        <WorkspaceBanner path={null} loading={false} error={null} onPick={onPick} variant="chip" />,
      );
      const btn = screen.getByRole('button', { name: /pick a project folder/i });
      fireEvent.click(btn);
      expect(onPick).toHaveBeenCalledTimes(1);
    });

    it('renders short folder name + Change button when path is set', () => {
      const onPick = vi.fn();
      render(
        <WorkspaceBanner
          path="/Users/me/projects/demo"
          loading={false}
          error={null}
          onPick={onPick}
          variant="chip"
        />,
      );
      expect(screen.getByText('demo')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /change project folder/i }));
      expect(onPick).toHaveBeenCalledTimes(1);
    });

    it('renders loading state without calling onPick', () => {
      const onPick = vi.fn();
      render(
        <WorkspaceBanner path={null} loading={true} error={null} onPick={onPick} variant="chip" />,
      );
      expect(screen.getByText(/loading/i)).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('card variant', () => {
    it('renders empty-state CTA and surfaces error message', () => {
      const onPick = vi.fn();
      render(
        <WorkspaceBanner
          path={null}
          loading={false}
          error="not a beaver project"
          onPick={onPick}
          variant="card"
        />,
      );
      expect(screen.getByRole('alert').textContent).toMatch(/not a beaver project/);
      fireEvent.click(screen.getByRole('button', { name: /pick folder/i }));
      expect(onPick).toHaveBeenCalledTimes(1);
    });

    it('omits the alert region when no error', () => {
      render(
        <WorkspaceBanner
          path={null}
          loading={false}
          error={null}
          onPick={() => {}}
          variant="card"
        />,
      );
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
