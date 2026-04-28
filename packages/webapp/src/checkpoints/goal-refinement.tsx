// `goal-refinement` checkpoint — Ralph-inspired structured spec review.
//
// Body renders, in this order:
//   1. raw vs enriched goal diff (the original Phase 7.2 surface)
//   2. assumptions (bullet list)
//   3. clarifying questions with lettered options (Ralph "1A 2C 3B" style)
//   4. PRD sections — overview, goals, user stories, non-goals, success metrics
//   5. MVP — pitch, features, deferred, scope
//
// Each PRD/MVP section gets a "Suggest edit" button that pre-fills the
// answer with a `comment:[section] ` prefix so the planner can route
// the user's nudge to the right block on the next refinement iteration.
// Falls back to plain prompt rendering when no `refinement` payload is
// supplied (older transports / pre-W.10 fixtures).

import { ApproveActions } from './actions.js';
import { SECONDARY } from '../lib/buttonClasses.js';
import type { ClarifyingQuestion, GoalRefinement, MVP, PRD } from '../types.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function GoalRefinementBody({ checkpoint, onAnswer }: CheckpointBodyProps) {
  const r = checkpoint.refinement;
  if (!r) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-caption text-text-500">Goal refinement</span>
        <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <span className="text-caption text-text-500">Goal refinement</span>
      <GoalDiff refinement={r} />
      {r.assumptions.length > 0 ? (
        <Section title="Assumptions" testId="refinement-assumptions">
          <ul className="list-disc pl-5 text-body text-text-300">
            {r.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {r.clarifyingQuestions && r.clarifyingQuestions.length > 0 ? (
        <ClarifyingQuestions
          questions={r.clarifyingQuestions}
          checkpointId={checkpoint.id}
          onAnswer={onAnswer}
        />
      ) : null}
      {r.questions.length > 0 ? (
        <Section title="Open questions" testId="refinement-questions" tone="accent">
          <ol className="list-decimal pl-5 text-body text-text-50">
            {r.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </Section>
      ) : null}
      {r.prd ? <PRDView prd={r.prd} checkpointId={checkpoint.id} onAnswer={onAnswer} /> : null}
      {r.mvp ? <MVPView mvp={r.mvp} checkpointId={checkpoint.id} onAnswer={onAnswer} /> : null}
    </div>
  );
}

// --- sub-views --------------------------------------------------------

function GoalDiff({ refinement }: { refinement: GoalRefinement }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <GoalColumn label="Your goal" body={refinement.rawGoal} dimmed />
      <GoalColumn label="Beaver's read" body={refinement.enrichedGoal} highlight />
    </div>
  );
}

interface GoalColumnProps {
  label: string;
  body: string;
  dimmed?: boolean;
  highlight?: boolean;
}

function GoalColumn({ label, body, dimmed, highlight }: GoalColumnProps) {
  return (
    <div
      className={
        'flex flex-col gap-1 rounded-card bg-surface-900 px-3 py-2 ' +
        (dimmed ? 'opacity-70 ' : '') +
        (highlight ? 'ring-1 ring-accent-700' : '')
      }
    >
      <span className="text-caption text-text-500">{label}</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

interface SectionProps {
  title: string;
  testId?: string;
  tone?: 'default' | 'accent' | 'danger';
  /** Render a "Suggest edit" button when supplied. `undefined` is
   *  accepted explicitly so call sites can pass a ternary without
   *  fighting `exactOptionalPropertyTypes`. */
  editAction?: { onClick: () => void } | undefined;
  children: React.ReactNode;
}

function Section({ title, testId, tone = 'default', editAction, children }: SectionProps) {
  const titleClass =
    tone === 'accent'
      ? 'text-caption text-accent-400'
      : tone === 'danger'
        ? 'text-caption text-danger-500'
        : 'text-caption text-text-500';
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-1 rounded-card bg-surface-900 px-3 py-2"
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className={titleClass}>{title}</span>
        {editAction ? (
          <button
            type="button"
            data-testid={`suggest-edit-${testId}`}
            onClick={editAction.onClick}
            className="rounded-card bg-surface-800 px-2 py-0.5 text-caption text-text-300 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Suggest edit
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

interface ClarifyingQuestionsProps {
  questions: readonly ClarifyingQuestion[];
  checkpointId: string;
  onAnswer?: ((id: string, response: string) => Promise<void>) | undefined;
}

function ClarifyingQuestions({ questions, checkpointId, onAnswer }: ClarifyingQuestionsProps) {
  const onPick = (qId: string, optionLabel: string): void => {
    if (!onAnswer) return;
    void onAnswer(checkpointId, `comment:${qId}=${optionLabel}`);
  };
  return (
    <Section title="Clarifying questions" testId="refinement-clarifying">
      <ol className="flex flex-col gap-3 text-body text-text-50">
        {questions.map((q) => (
          <li key={q.id} data-testid={`clarifying-${q.id}`} className="flex flex-col gap-1">
            <span>
              <span className="text-text-500 font-mono">{q.id}.</span> {q.text}
            </span>
            <div className="flex flex-wrap gap-2 pl-4">
              {q.options.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onPick(q.id, opt.label)}
                  data-testid={`clarifying-${q.id}-${opt.label}`}
                  className={`${SECONDARY} text-caption`}
                  disabled={!onAnswer}
                >
                  <span className="font-mono">{opt.label}.</span>&nbsp;{opt.value}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// --- PRD view ---------------------------------------------------------

interface PRDViewProps {
  prd: PRD;
  checkpointId: string;
  onAnswer?: ((id: string, response: string) => Promise<void>) | undefined;
}

function PRDView({ prd, checkpointId, onAnswer }: PRDViewProps) {
  const editFor = (section: string) => () => {
    if (!onAnswer) return;
    void onAnswer(checkpointId, `comment:[prd:${section}] (please describe the change)`);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="refinement-prd">
      <span className="text-caption text-text-500">PRD</span>
      <Section
        title="Overview"
        testId="prd-overview"
        editAction={onAnswer ? { onClick: editFor('overview') } : undefined}
      >
        <p className="text-body text-text-300 whitespace-pre-wrap">{prd.overview}</p>
      </Section>
      <Section
        title="Goals"
        testId="prd-goals"
        editAction={onAnswer ? { onClick: editFor('goals') } : undefined}
      >
        <ul className="list-disc pl-5 text-body text-text-300">
          {prd.goals.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </Section>
      {prd.userStories.length > 0 ? (
        <Section
          title="User stories"
          testId="prd-user-stories"
          editAction={onAnswer ? { onClick: editFor('user-stories') } : undefined}
        >
          <ul className="space-y-2">
            {prd.userStories.map((us) => (
              <li
                key={us.id}
                data-testid={`prd-user-story-${us.id}`}
                className="rounded-card bg-surface-800 px-3 py-2"
              >
                <p className="text-body text-text-50 font-medium">
                  <span className="font-mono text-text-500">{us.id}</span> · {us.title}
                </p>
                <p className="text-caption text-text-300">{us.description}</p>
                {us.acceptanceCriteria.length > 0 ? (
                  <ul className="mt-1 list-disc pl-5 text-caption text-text-300">
                    {us.acceptanceCriteria.map((ac, i) => (
                      <li key={i}>{ac}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {prd.nonGoals.length > 0 ? (
        <Section
          title="Non-goals"
          testId="prd-non-goals"
          tone="danger"
          editAction={onAnswer ? { onClick: editFor('non-goals') } : undefined}
        >
          <ul className="list-disc pl-5 text-body text-text-300">
            {prd.nonGoals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {prd.successMetrics.length > 0 ? (
        <Section
          title="Success metrics"
          testId="prd-success-metrics"
          editAction={onAnswer ? { onClick: editFor('success-metrics') } : undefined}
        >
          <ul className="list-disc pl-5 text-body text-text-300">
            {prd.successMetrics.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

// --- MVP view ---------------------------------------------------------

interface MVPViewProps {
  mvp: MVP;
  checkpointId: string;
  onAnswer?: ((id: string, response: string) => Promise<void>) | undefined;
}

function MVPView({ mvp, checkpointId, onAnswer }: MVPViewProps) {
  const editFor = (section: string) => () => {
    if (!onAnswer) return;
    void onAnswer(checkpointId, `comment:[mvp:${section}] (please describe the change)`);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="refinement-mvp">
      <span className="text-caption text-accent-400">MVP</span>
      <Section
        title="Pitch"
        testId="mvp-pitch"
        editAction={onAnswer ? { onClick: editFor('pitch') } : undefined}
      >
        <p className="text-body text-text-300 italic">{mvp.pitch}</p>
      </Section>
      <Section
        title="Features"
        testId="mvp-features"
        editAction={onAnswer ? { onClick: editFor('features') } : undefined}
      >
        <ul className="list-disc pl-5 text-body text-text-300">
          {mvp.features.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </Section>
      {mvp.deferred.length > 0 ? (
        <Section
          title="Deferred"
          testId="mvp-deferred"
          editAction={onAnswer ? { onClick: editFor('deferred') } : undefined}
        >
          <ul className="list-disc pl-5 text-caption text-text-500">
            {mvp.deferred.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section
        title="Scope"
        testId="mvp-scope"
        editAction={onAnswer ? { onClick: editFor('scope') } : undefined}
      >
        <p className="text-caption text-text-500 font-mono">{mvp.scope}</p>
      </Section>
    </div>
  );
}

export const goalRefinement: CheckpointEntry = {
  Body: GoalRefinementBody,
  Actions: ApproveActions,
};
