// Detect whether the renderer is running inside the Tauri shell.
//
// The Tauri runtime injects a `__TAURI_INTERNALS__` object on `window`
// before the bundle loads. Hash-checking that is the canonical way to
// branch between mock transports (browser dev) and real transports
// (desktop shell).

interface TauriWindow {
  __TAURI_INTERNALS__?: unknown;
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as TauriWindow).__TAURI_INTERNALS__);
}
