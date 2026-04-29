// `?` opens this dialog. Lists every documented shortcut. Esc closes.

import { useRef } from 'react';

import { ModalShell } from './ModalShell.js';
import { PRIMARY } from '../lib/buttonClasses.js';
import {
  SHORTCUTS,
  type ShortcutBinding,
  type ShortcutTarget,
} from '../hooks/useKeyboardShortcuts.js';
import { useTelemetryConsent } from '../hooks/useTelemetryConsent.js';
import { LOCALES, t, type Locale } from '../i18n/index.js';

const TARGET_LABEL: Record<ShortcutTarget, string> = {
  home: 'Home',
  status: 'Run / Status',
  prd: 'PRD',
  checkpoints: 'Checkpoints',
  plan: 'Plan',
  logs: 'Logs',
  review: 'Review',
  wiki: 'Wiki',
  help: 'Open this help',
};

function formatShortcut(s: ShortcutBinding): string {
  if (s.modifier === 'cmd-or-ctrl') {
    return `Cmd / Ctrl + ${s.key.toUpperCase()}`;
  }
  if (s.key === '?') return 'Shift + /';
  return s.key.toUpperCase();
}

export interface HelpDialogProps {
  onClose: () => void;
  /** Phase 4-B — current UI locale. Defaults to 'en' so callers
   *  that haven't been wired to useLocale yet still render. */
  locale?: Locale;
  /** Phase 4-B — switch the UI locale. When omitted, the locale
   *  toggle row is hidden (caller didn't opt into the i18n flow). */
  onLocaleChange?: (next: Locale) => void;
}

const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
};

export function HelpDialog({ onClose, locale = 'en', onLocaleChange }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const telemetry = useTelemetryConsent();
  return (
    <ModalShell
      titleId="help-dialog-title"
      onClose={onClose}
      initialFocusRef={closeRef}
      testId="help-dialog"
    >
      <h3 id="help-dialog-title" className="text-hero text-text-50">
        Keyboard shortcuts
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
        {SHORTCUTS.map((s) => (
          <div key={`${s.modifier ?? 'plain'}-${s.key}`} className="contents">
            <dt className="font-mono text-text-50">{formatShortcut(s)}</dt>
            <dd className="text-text-300">{TARGET_LABEL[s.target]}</dd>
          </div>
        ))}
        <dt className="font-mono text-text-50">Cmd / Ctrl + Enter</dt>
        <dd className="text-text-300">Submit goal from the GoalBox</dd>
        <dt className="font-mono text-text-50">Esc</dt>
        <dd className="text-text-300">Close any dialog</dd>
      </dl>
      {onLocaleChange ? (
        <section
          data-testid="help-dialog-locale"
          className="rounded-card border border-surface-700 bg-surface-900 p-4"
          aria-labelledby="locale-section-title"
        >
          <h4 id="locale-section-title" className="text-body text-text-50 font-medium">
            {t(locale, 'help.locale.title')}
          </h4>
          <p className="mt-1 text-caption text-text-400">{t(locale, 'help.locale.body')}</p>
          <div className="mt-3 flex gap-2">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onLocaleChange(l)}
                aria-pressed={locale === l}
                data-testid={`locale-button-${l}`}
                className={
                  locale === l
                    ? 'rounded-card bg-accent-500 px-3 py-1 text-caption text-surface-900'
                    : 'rounded-card bg-surface-700 px-3 py-1 text-caption text-text-50 hover:bg-surface-600'
                }
              >
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section
        data-testid="help-dialog-telemetry"
        className="rounded-card border border-surface-700 bg-surface-900 p-4"
        aria-labelledby="telemetry-section-title"
      >
        <h4 id="telemetry-section-title" className="text-body text-text-50 font-medium">
          Privacy &amp; telemetry
        </h4>
        <p className="mt-1 text-caption text-text-400">
          Beaver runs locally — your code, your goals, and your wiki never leave the machine.
          Anonymous usage telemetry is <strong>off by default</strong>. v0.1.x doesn&apos;t send
          anything yet; the toggle below stores your preference for future versions.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-caption text-text-300" data-testid="telemetry-status">
            Currently: <strong className="font-mono text-text-50">{telemetry.consent}</strong>
          </span>
          {telemetry.consent === 'opted-in' ? (
            <button
              type="button"
              onClick={telemetry.optOut}
              className="rounded-card bg-surface-700 px-3 py-1 text-caption text-text-50 transition-colors hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              Opt out
            </button>
          ) : (
            <button
              type="button"
              onClick={telemetry.optIn}
              className="rounded-card bg-surface-700 px-3 py-1 text-caption text-text-50 transition-colors hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              Opt in
            </button>
          )}
        </div>
      </section>
      <div className="flex justify-end">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className={PRIMARY}
          aria-label="Close help dialog"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
}
