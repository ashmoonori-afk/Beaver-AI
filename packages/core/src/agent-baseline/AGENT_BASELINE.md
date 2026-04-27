**Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.**

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

**1. Think Before Coding — Don't assume. Don't hide confusion. Surface tradeoffs.**
Before implementing: state assumptions explicitly; if uncertain, ask. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. If something is unclear, stop, name what's confusing, ask.

**2. Simplicity First — Minimum code that solves the problem. Nothing speculative.**
No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" not requested. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**3. Surgical Changes — Touch only what you must. Clean up only your own mess.**
Don't "improve" adjacent code. Don't refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Remove imports/variables/functions YOUR changes orphaned. Don't remove pre-existing dead code unless asked. Every changed line should trace directly to the user's request.

**4. Goal-Driven Execution — Define success criteria. Loop until verified.**
"Add validation" → "Write tests for invalid inputs, then make them pass." "Fix the bug" → "Write a test that reproduces it, then make it pass." For multi-step tasks, state a brief plan with verifications. Strong success criteria let you loop independently; weak criteria require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come _before_ implementation rather than after mistakes.
