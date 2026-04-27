// @vitest-environment jsdom

// Sprint W.7 / 4U.6 review gate: every interactive element passes
// axe-core in CI. The harness picks the most important panels +
// dialogs and runs axe in jsdom. We disable rules that depend on
// real-browser color computation (color-contrast) since jsdom does
// not implement layout/styling — the lint is structural a11y.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import axe from 'axe-core';

import App from './App.js';
import { CheckpointPanel } from './components/CheckpointPanel.js';
import { ConfirmDiscardModal } from './components/ConfirmDiscardModal.js';
import { HelpDialog } from './components/HelpDialog.js';
import { LogsPanel } from './components/LogsPanel.js';
import { PlanPanel } from './components/PlanPanel.js';
import { ReviewPanel } from './components/ReviewPanel.js';
import { WikiSearch } from './components/WikiSearch.js';
import { makeMockAskWikiTransport } from './hooks/mockAskWikiTransport.js';
import type { CheckpointSummary, FinalReportSummary, LogEvent, PlanSummary } from './types.js';

afterEach(() => {
  cleanup();
});

const AXE_OPTIONS: axe.RunOptions = {
  // jsdom has no layout engine; skip rules that need it.
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
};

async function expectNoViolations(node: HTMLElement): Promise<void> {
  const results = await axe.run(node, AXE_OPTIONS);
  if (results.violations.length > 0) {
    const summary = results.violations
      .map((v) => `${v.id}: ${v.description} (${v.nodes.length} nodes)`)
      .join('\n');
    throw new Error(`axe-core found ${results.violations.length} violation(s):\n${summary}`);
  }
  expect(results.violations).toEqual([]);
}

describe('a11y — axe-core (4U.6 review gate)', () => {
  it('App default shell passes axe', async () => {
    const { container } = render(<App />);
    await expectNoViolations(container);
  });

  it('PlanPanel passes axe', async () => {
    const plans: PlanSummary[] = [
      {
        id: 'p-1',
        runId: 'r-1',
        version: 1,
        createdAt: new Date('2026-04-28T00:00:00.000Z').toISOString(),
        tasks: [{ id: 't1', agentRole: 'planner', title: 'design' }],
      },
    ];
    const { container } = render(<PlanPanel plans={plans} />);
    await expectNoViolations(container);
  });

  it('LogsPanel passes axe', async () => {
    const events: LogEvent[] = [
      {
        id: 'e1',
        runId: 'r-1',
        ts: '2026-04-28T00:00:00.000Z',
        level: 'info',
        source: 'orchestrator',
        message: 'started',
      },
    ];
    const { container } = render(<LogsPanel events={events} />);
    await expectNoViolations(container);
  });

  it('CheckpointPanel passes axe (with one approve-style card)', async () => {
    const cps: CheckpointSummary[] = [
      {
        id: 'cp-1',
        runId: 'r-1',
        kind: 'plan-approval',
        prompt: 'approve?',
        postedAt: new Date('2026-04-28T00:00:00.000Z').toISOString(),
      },
    ];
    const { container } = render(<CheckpointPanel checkpoints={cps} onAnswer={vi.fn()} />);
    await expectNoViolations(container);
  });

  it('ReviewPanel passes axe', async () => {
    const report: FinalReportSummary = {
      runId: 'r-1',
      generatedAt: '2026-04-28T00:00:00.000Z',
      markdown: 'shipped',
      branches: [
        {
          ref: 'beaver/r-1/coder',
          agentRole: 'coder',
          diff: { filesChanged: 1, insertions: 1, deletions: 0 },
        },
      ],
    };
    const { container } = render(<ReviewPanel report={report} onDecide={vi.fn()} />);
    await expectNoViolations(container);
  });

  it('WikiSearch panel passes axe', async () => {
    const { container } = render(<WikiSearch transport={makeMockAskWikiTransport()} />);
    await expectNoViolations(container);
  });

  it('HelpDialog passes axe', async () => {
    const { container } = render(<HelpDialog onClose={vi.fn()} />);
    await expectNoViolations(container);
  });

  it('ConfirmDiscardModal passes axe', async () => {
    const { container } = render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await expectNoViolations(container);
  });
});
