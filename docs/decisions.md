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

- Task 3 complete: real WebSocket integration tests pass, including authentication, stale revisions, malformed messages, oversized payloads, foreign origins and reconnect snapshots.
- Task 4 complete: chooser, registration, placement, DM controls and player views implemented. Real Chrome acceptance passes on desktop and 390px mobile; screenshots inspected. No JavaScript errors observed.
- Final review: an independent reviewer identified four important issues. Added regressions, observed them fail, and fixed LAN invite URLs, timestamp-free public event IDs, roster-derived Grey Man defaults, and advancement beyond the forecast horizon.
- Final review: treated the reported minor pending-placement reset as important because it could cause incorrect starting zones. The browser regression reproduced both lost placement and stale party-size defaults; both now pass.
- Final review: no deferred findings. Browser-only layout, clipboard and reconnect behavior were independently exercised by the main acceptance test after the reviewer declined to judge them from source alone.
- Ruling: retain the feature branch locally without merging or publishing. This is a new empty repository and the user asked for an autonomous local build; cost if wrong: a later integration step is needed.
- Ruling: forecast stops at the next unresolved ritual phase and shows at most 100 events within 48 ticks for the DM. Authoritative advancement is independent of this preview, so long delays never block the encounter.
- Ruling: bounds are 100 actors, 80-character names, initiative totals between −1000 and 1000, 16 KiB WebSocket messages, and 50 undo states. These keep accidental input/resource use bounded; cost if wrong: an unusually large encounter needs those limits raised.
- Final visual check: corrected a CSS display rule overriding the chooser's hidden role-switch button; the real-browser regression failed before the fix and is included in final acceptance.

## Final verification

- `npm test`: **35 passed, 0 failed**.
- Real Chrome acceptance: passed registration, initial placement, roster/default updates, rejoining, ritual start/delay/interrupt/resume, Grey Man activation, movement, pillar changes, collapse, refresh, dropped-socket reconnect, character removal, literal markup rendering, long ritual delays, invitation clipboard fallback, keyboard focus, and mobile overflow checks.
- Desktop and 390px mobile screenshots inspected. No browser JavaScript errors.
- `git diff --check`: clean.
- Task 5 complete: README and decision record delivered. App left running with a fresh empty scene; the example encounter is available through the DM controls. Retained on `codex/temporal-atrium`.
