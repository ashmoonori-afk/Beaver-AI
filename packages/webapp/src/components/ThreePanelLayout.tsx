// Three-panel split layout. v0.2 M3.1 + M3.2.
//
// Lays out the v0.2 main view as Chat (left) | PRD (center) | Live
// (right). Column widths are user-resizable via flex-grow ratios and
// persisted to localStorage so the next run remembers the layout.
//
// Implementation choice: plain flex + a `ResizeHandle` between
// columns. No new dep (and no react-window — the panels themselves
// virtualize via @tanstack/react-virtual where needed). Mobile /
// narrow widths fall back to a stacked layout (CSS only).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'beaver.threePanelLayout.v1';
const DEFAULT_WIDTHS: ThreePanelWidths = { left: 22, center: 46, right: 32 };
const MIN_PERCENT = 12;

interface ThreePanelWidths {
  left: number;
  center: number;
  right: number;
}

function readPersistedWidths(): ThreePanelWidths {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_WIDTHS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<ThreePanelWidths>;
    if (
      typeof parsed.left === 'number' &&
      typeof parsed.center === 'number' &&
      typeof parsed.right === 'number'
    ) {
      const sum = parsed.left + parsed.center + parsed.right;
      if (sum > 0) {
        return {
          left: (parsed.left / sum) * 100,
          center: (parsed.center / sum) * 100,
          right: (parsed.right / sum) * 100,
        };
      }
    }
  } catch {
    // Bad JSON, fall through to defaults.
  }
  return DEFAULT_WIDTHS;
}

function persistWidths(widths: ThreePanelWidths): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // QuotaExceeded etc. — not worth surfacing.
  }
}

export interface ThreePanelLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export function ThreePanelLayout({ left, center, right }: ThreePanelLayoutProps) {
  const [widths, setWidths] = useState<ThreePanelWidths>(readPersistedWidths);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    persistWidths(widths);
  }, [widths]);

  const onDragLeft = useDragHandle(containerRef, (deltaPct) => {
    setWidths((prev) =>
      clampWidths({
        left: prev.left + deltaPct,
        center: prev.center - deltaPct,
        right: prev.right,
      }),
    );
  });
  const onDragRight = useDragHandle(containerRef, (deltaPct) => {
    setWidths((prev) =>
      clampWidths({
        left: prev.left,
        center: prev.center + deltaPct,
        right: prev.right - deltaPct,
      }),
    );
  });

  const leftStyle: CSSProperties = { flexBasis: `${widths.left}%` };
  const centerStyle: CSSProperties = { flexBasis: `${widths.center}%` };
  const rightStyle: CSSProperties = { flexBasis: `${widths.right}%` };

  return (
    <div
      ref={containerRef}
      className="flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row lg:gap-0"
      data-testid="three-panel-layout"
    >
      <section
        style={leftStyle}
        className="flex min-w-0 flex-grow basis-full flex-col border-b border-surface-700 lg:border-b-0 lg:border-r"
      >
        {left}
      </section>
      <ResizeHandle onDragStart={onDragLeft} ariaLabel="Resize left and center panels" />
      <section
        style={centerStyle}
        className="flex min-w-0 flex-grow basis-full flex-col border-b border-surface-700 lg:border-b-0 lg:border-r"
      >
        {center}
      </section>
      <ResizeHandle onDragStart={onDragRight} ariaLabel="Resize center and right panels" />
      <section style={rightStyle} className="flex min-w-0 flex-grow basis-full flex-col">
        {right}
      </section>
    </div>
  );
}

function clampWidths(w: ThreePanelWidths): ThreePanelWidths {
  // Each panel must keep ≥ MIN_PERCENT so the user cannot accidentally
  // collapse one to zero and lose access to it.
  const left = Math.max(MIN_PERCENT, w.left);
  const right = Math.max(MIN_PERCENT, w.right);
  const center = Math.max(MIN_PERCENT, 100 - left - right);
  return { left, center, right };
}

interface ResizeHandleProps {
  onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  ariaLabel: string;
}

function ResizeHandle({ onDragStart, ariaLabel }: ResizeHandleProps) {
  // Pointer-only for v0.2; keyboard resize is a v0.2.x follow-up.
  // Marked aria-hidden so screen readers don't announce a control
  // that has no keyboard equivalent yet.
  return (
    <div
      aria-hidden="true"
      title={ariaLabel}
      onPointerDown={onDragStart}
      className="hidden w-1 shrink-0 cursor-col-resize bg-surface-700 transition-colors hover:bg-accent-500 lg:block"
    />
  );
}

/** Shared pointer-drag hook. Returns an onPointerDown that captures
 *  the pointer and reports per-frame deltas in container percent. */
function useDragHandle(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onDelta: (deltaPct: number) => void,
): (e: React.PointerEvent<HTMLDivElement>) => void {
  return useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      if (!containerRef.current) return;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const containerWidth = containerRef.current.clientWidth;
      let lastX = startX;

      const onMove = (move: PointerEvent): void => {
        const deltaPx = move.clientX - lastX;
        lastX = move.clientX;
        const deltaPct = (deltaPx / containerWidth) * 100;
        onDelta(deltaPct);
      };
      const onUp = (up: PointerEvent): void => {
        target.releasePointerCapture(up.pointerId);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [containerRef, onDelta],
  );
}
