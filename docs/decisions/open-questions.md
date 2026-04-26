# Open Questions

> Decisions still to resolve before MVP implementation. Each carries a current proposed direction; locking will move it into [locked.md](locked.md).

**Doc type:** decisions
**Status:** Open
**Last updated:** 2026-04-26 (Q4 resolved into D13)
**See also:** [decisions/locked.md](locked.md), [planning/next-steps.md](../planning/next-steps.md)

---

| #  | Question | Why it matters | Proposed direction |
|----|----------|----------------|--------------------|
| Q6 | **Resume semantics** — resume from the last completed task, or replay incomplete agent? | Idempotency requirements. | Resume from last completed task; in-flight agent is killed and re-spawned with the same prompt. |
| Q7 | **Multi-LLM cost optimization** — should the Orchestrator route by cost? | Cheap planner + expensive coder is the obvious win, but adds matching complexity. | Yes, but driven by `capabilities + cost` matching, not hand-tuned rules. Deferred to v0.2. |

---

## Resolution log

- **Q1, Q2, Q5** (resolved 2026-04-26) → locked as D6, D7, D8 in [locked.md](locked.md).
- **Q3** (resolved 2026-04-26) → locked as D9 in [locked.md](locked.md); full policy in [models/sandbox-policy.md](../models/sandbox-policy.md).
- **Q4** (resolved 2026-04-26) → folded into D13 in [locked.md](locked.md); localhost-only, bound to 127.0.0.1, no auth. Detail in [models/app-ui.md](../models/app-ui.md).
