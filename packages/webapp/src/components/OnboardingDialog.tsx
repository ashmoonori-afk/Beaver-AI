// Phase 3-A — first-run onboarding dialog. Three short steps that
// teach the agent's mental model (autonomous, plans first, asks at
// checkpoints) and route the user through workspace selection
// without leaving the dialog.
//
// Phase 4-B — copy is sourced from the i18n table so the dialog
// renders in Korean for users on a Korean browser. The structure
// (3 steps in fixed order) is locale-agnostic.

import { useRef, useState } from 'react';

import { ModalShell } from './ModalShell.js';
import { PRIMARY } from '../lib/buttonClasses.js';
import { t, type Locale, type StringKey } from '../i18n/index.js';

export interface OnboardingDialogProps {
  /** Pick-folder action. Resolved when the user has picked a folder
   *  (or rejected when they cancelled). The dialog moves forward
   *  optimistically — the workspace card / banner outside the
   *  dialog handles errors. */
  onPickWorkspace: () => Promise<void> | void;
  /** Currently-selected workspace path (or null). Drives the
   *  step-2 "you picked X" affordance. */
  workspacePath: string | null;
  /** Fires on completion AND on skip — the controller flips the
   *  persisted seen flag either way so the dialog doesn't return. */
  onComplete: () => void;
  /** Phase 4-B — caller-provided locale. Defaults to 'en' so
   *  existing tests + browser-mode renders don't need to thread
   *  a locale through every layer. */
  locale?: Locale;
}

interface StepDef {
  id: 'welcome' | 'workspace' | 'goal';
  titleKey: StringKey;
  bodyKey: StringKey;
}

const STEPS: readonly StepDef[] = [
  { id: 'welcome', titleKey: 'onboarding.welcome.title', bodyKey: 'onboarding.welcome.body' },
  { id: 'workspace', titleKey: 'onboarding.workspace.title', bodyKey: 'onboarding.workspace.body' },
  { id: 'goal', titleKey: 'onboarding.goal.title', bodyKey: 'onboarding.goal.body' },
];

export function OnboardingDialog({
  onPickWorkspace,
  workspacePath,
  onComplete,
  locale = 'en',
}: OnboardingDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[stepIndex]!;
  const isLast = stepIndex === STEPS.length - 1;
  const titleId = 'onboarding-dialog-title';

  const advance = (): void => {
    if (isLast) {
      onComplete();
    } else {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }
  };

  const handlePick = async (): Promise<void> => {
    try {
      await onPickWorkspace();
    } catch {
      // Picker errors surface in the workspace banner, not here.
    }
  };

  return (
    <ModalShell
      titleId={titleId}
      onClose={onComplete}
      initialFocusRef={primaryRef}
      testId="onboarding-dialog"
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="text-caption uppercase tracking-wide text-text-500"
          data-testid="onboarding-step-counter"
        >
          {t(locale, 'onboarding.step_counter', {
            current: stepIndex + 1,
            total: STEPS.length,
          })}
        </span>
        <button
          type="button"
          onClick={onComplete}
          className="rounded-card px-2 py-1 text-caption text-text-300 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label={t(locale, 'onboarding.skip')}
        >
          {t(locale, 'onboarding.skip')}
        </button>
      </div>
      <h3 id={titleId} className="text-hero text-text-50">
        {t(locale, step.titleKey)}
      </h3>
      <p className="text-body text-text-300">{t(locale, step.bodyKey)}</p>

      {step.id === 'workspace' ? (
        <div
          data-testid="onboarding-workspace-row"
          className="rounded-card border border-surface-700 bg-surface-900 p-3"
        >
          {workspacePath ? (
            <p className="text-caption text-text-300">
              <span className="text-text-500">{t(locale, 'onboarding.workspace.currently')}</span>{' '}
              <span className="font-mono text-text-50">{workspacePath}</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => {
                void handlePick();
              }}
              className={PRIMARY}
              data-testid="onboarding-pick-folder"
            >
              {t(locale, 'onboarding.workspace.pick')}
            </button>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <ol className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              data-testid={`onboarding-dot-${s.id}`}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === stepIndex
                  ? 'bg-accent-500'
                  : i < stepIndex
                    ? 'bg-accent-700'
                    : 'bg-surface-600'
              }`}
            />
          ))}
        </ol>
        <button
          ref={primaryRef}
          type="button"
          onClick={advance}
          className={PRIMARY}
          data-testid="onboarding-advance"
        >
          {isLast ? t(locale, 'onboarding.lets_go') : t(locale, 'onboarding.next')}
        </button>
      </div>
    </ModalShell>
  );
}

export const __test__ = { STEPS };
