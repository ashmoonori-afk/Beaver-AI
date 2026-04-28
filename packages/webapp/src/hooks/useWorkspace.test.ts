// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

interface TauriWindow {
  __TAURI_INTERNALS__?: unknown;
}

beforeEach(() => {
  invokeMock.mockReset();
  (window as unknown as TauriWindow).__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  cleanup();
  delete (window as unknown as TauriWindow).__TAURI_INTERNALS__;
});

describe('useWorkspace', () => {
  it('seeds path from workspace_get and clears loading once resolved', async () => {
    invokeMock.mockResolvedValueOnce('/Users/me/projects/demo');
    const { useWorkspace } = await import('./useWorkspace.js');
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.path).toBe('/Users/me/projects/demo');
    expect(invokeMock).toHaveBeenCalledWith('workspace_get');
  });

  it('returns null path when invoke throws (still clears loading)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    invokeMock.mockRejectedValueOnce(new Error('IPC bind failed'));
    const { useWorkspace } = await import('./useWorkspace.js');
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.path).toBeNull();
    errSpy.mockRestore();
  });

  it('pick() updates path on success and clears any prior error', async () => {
    invokeMock.mockResolvedValueOnce(null); // workspace_get
    invokeMock.mockResolvedValueOnce({ path: '/Users/me/projects/picked' });
    const { useWorkspace } = await import('./useWorkspace.js');
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    let returned: string | null = 'sentinel';
    await act(async () => {
      returned = await result.current.pick();
    });
    expect(returned).toBe('/Users/me/projects/picked');
    expect(result.current.path).toBe('/Users/me/projects/picked');
    expect(result.current.error).toBeNull();
  });

  it('pick() surfaces error message when invoke rejects', async () => {
    invokeMock.mockResolvedValueOnce(null); // workspace_get
    invokeMock.mockRejectedValueOnce(new Error('not a beaver project'));
    const { useWorkspace } = await import('./useWorkspace.js');
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    await act(async () => {
      const v = await result.current.pick();
      expect(v).toBeNull();
    });
    expect(result.current.error).toMatch(/not a beaver project/);
  });

  it('returns null and skips invoke when not running in Tauri', async () => {
    delete (window as unknown as TauriWindow).__TAURI_INTERNALS__;
    const { useWorkspace } = await import('./useWorkspace.js');
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.path).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    let returned: string | null = 'sentinel';
    await act(async () => {
      returned = await result.current.pick();
    });
    expect(returned).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
