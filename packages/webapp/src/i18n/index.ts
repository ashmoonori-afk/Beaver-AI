// Phase 4-B — minimal i18n. Two locales (en, ko) and a string
// table keyed by stable identifier. The `t()` function takes a
// locale + key + optional substitution map; missing keys fall back
// to English so a partial translation still ships something
// readable.
//
// We deliberately keep this in plain TS — no react-intl /
// formatjs dep — because v0.1.x only needs flat lookups. Plural
// rules and rich ICU formatting can come in a later phase.

export type Locale = 'en' | 'ko';

export const LOCALES: readonly Locale[] = ['en', 'ko'];

export type StringKey =
  | 'onboarding.skip'
  | 'onboarding.next'
  | 'onboarding.lets_go'
  | 'onboarding.step_counter'
  | 'onboarding.welcome.title'
  | 'onboarding.welcome.body'
  | 'onboarding.workspace.title'
  | 'onboarding.workspace.body'
  | 'onboarding.workspace.pick'
  | 'onboarding.workspace.currently'
  | 'onboarding.goal.title'
  | 'onboarding.goal.body'
  | 'help.locale.title'
  | 'help.locale.body';

const STRINGS: Record<Locale, Record<StringKey, string>> = {
  en: {
    'onboarding.skip': 'Skip',
    'onboarding.next': 'Next',
    'onboarding.lets_go': "Let's go",
    'onboarding.step_counter': 'Step {current} / {total}',
    'onboarding.welcome.title': 'Welcome to Beaver',
    'onboarding.welcome.body':
      'Beaver is a fully-autonomous coding agent that runs locally. Type a goal — Beaver plans, writes code in its own worktree, reviews itself, and asks you to approve only the things that matter.',
    'onboarding.workspace.title': 'Pick a project folder',
    'onboarding.workspace.body':
      'Beaver works inside a project directory. It writes plans + a SQLite ledger to .beaver/ alongside your code. You can change folders any time from the chip in the header.',
    'onboarding.workspace.pick': 'Pick a folder',
    'onboarding.workspace.currently': 'Currently:',
    'onboarding.goal.title': 'Type a goal and press Enter',
    'onboarding.goal.body':
      'Plain English is fine — "add a /healthz endpoint with a smoke test" or "refactor the parser into a state machine." Beaver will refine the goal, draft a plan, and pause at checkpoints when it needs you. Hit ? any time for keyboard shortcuts.',
    'help.locale.title': 'Language',
    'help.locale.body': 'Switch the UI language. Changes take effect immediately.',
  },
  ko: {
    'onboarding.skip': '건너뛰기',
    'onboarding.next': '다음',
    'onboarding.lets_go': '시작하기',
    'onboarding.step_counter': '{current} / {total} 단계',
    'onboarding.welcome.title': 'Beaver에 오신 것을 환영합니다',
    'onboarding.welcome.body':
      'Beaver는 로컬에서 실행되는 완전 자율 코딩 에이전트입니다. 목표를 입력하면 — Beaver가 계획하고, 자체 worktree에서 코드를 작성하고, 스스로 리뷰하며, 정말 중요한 결정만 사용자에게 묻습니다.',
    'onboarding.workspace.title': '프로젝트 폴더 선택',
    'onboarding.workspace.body':
      'Beaver는 프로젝트 디렉토리 안에서 동작합니다. 계획과 SQLite 원장을 코드 옆 .beaver/ 에 기록합니다. 헤더의 칩에서 언제든 폴더를 바꿀 수 있습니다.',
    'onboarding.workspace.pick': '폴더 선택',
    'onboarding.workspace.currently': '현재:',
    'onboarding.goal.title': '목표를 입력하고 Enter',
    'onboarding.goal.body':
      '일상적인 한국어로 충분합니다 — "/healthz 엔드포인트와 스모크 테스트 추가" 나 "파서를 상태 머신으로 리팩터링" 같은 식이죠. Beaver가 목표를 다듬고, 계획을 짜고, 필요할 때만 체크포인트에서 잠시 멈춰 사용자에게 묻습니다. 키보드 단축키는 ? 키로 확인할 수 있습니다.',
    'help.locale.title': '언어',
    'help.locale.body': 'UI 언어를 전환합니다. 변경 사항은 즉시 적용됩니다.',
  },
};

/** Lookup a translation. Falls back to English when `locale`'s
 *  table is missing the key — guarantees a readable string even
 *  for partial translations. */
export function t(
  locale: Locale,
  key: StringKey,
  substitutions: Readonly<Record<string, string | number>> = {},
): string {
  const raw = STRINGS[locale]?.[key] ?? STRINGS.en[key];
  if (Object.keys(substitutions).length === 0) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = substitutions[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

/** Detect the user's preferred locale from the browser. Returns
 *  `'ko'` when navigator.language starts with `ko`, else `'en'`. */
export function detectLocale(language: string | undefined): Locale {
  if (!language) return 'en';
  return language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export const __test__ = { STRINGS };
