---
name: beaver
description: Run Beaver AI on the current goal. Usage: /beaver <free-text goal> — drives plan → execute → review with sandbox + budget guardrails.
---

The user invoked `/beaver $ARGUMENTS`.

If `$ARGUMENTS` is empty, ask the user what goal they want Beaver to pursue.

Otherwise, run:

```bash
node packages/cli/src/bin.ts run --no-server "$ARGUMENTS"
```

After the run completes, report:

- Final state (COMPLETED / FAILED / ABORTED)
- Open checkpoints (if any) — instruct the user to answer with `node packages/cli/src/bin.ts answer <id> approve|reject|comment <text>`
- Branch names produced (`git branch | grep beaver/`)
- Total USD spent
