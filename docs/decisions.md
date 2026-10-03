# Build decisions and progress

Plan: docs/superpowers/plans/2026-10-03-temporal-atrium.md

- Ruling: build in the provided empty repository on a feature branch, rather than a second worktree. There is no committed base to branch a worktree from, and this keeps the delivered app in the user's chosen folder. Cost if wrong: changes would need moving to a separate checkout later.
- Ruling: use the user's autonomous instruction as approval to execute the plan natively and resolve implementation details without further checkpoints.
- Pre-flight: timing → encounter → projection → server → UI interfaces are consistent. Server revisions and credentials are separate from undoable encounter state.
- Ruling: keep this decision record in the delivered repository, rather than disposable workflow scratch files, so the absent user can review choices and verification.

- Task 1 complete: timing tests passed (5 tests), including repeated rate changes and rate-weighted initial initiative.
- Task 2 complete: encounter and projection tests passed, including ritual controls, removal, collapse, and limited player timelines.
- Ruling: changing Grey Man configuration resets his counter and pending activation, and is disabled during his active turn. This makes adjustments explicit; cost if wrong: DM may need to defer configuration until the next cycle.
- Ruling: player names remain DM-only; the public rejoin list displays character names. Public rejoining requires no credentials because it grants only the already-requested read-only view.
