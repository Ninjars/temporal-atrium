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

## Interaction update

- Actor rows now show occupants in each atrium zone. Native drag-and-drop invokes the same validated movement or placement commands as the selectors; collapsed zones reject drops. Selectors remain available for keyboard and touch use.
- Grey Man now has a physical zone (initially 0) independent of his turn counter. He must be moved or withdrawn if stranded by collapse. His zone does not alter turn frequency.
- Player forecasts cover the complete next 12 ticks, including repeated turns and events after a scheduled ritual phase. Ruling: assume scheduled ritual success for projection only, and omit turns for projected collapsed occupants. Cost if wrong: a DM rescue or delay changes the forecast, which recalculates immediately.
- Ritual rows identify phase number and the collapsing pair explicitly, e.g. Phase 2/6: zones −5 and +5 will collapse.
- Finish & next is one atomic, undoable command. It completes one turn and begins one next event, preserving precedence and stopping on an unresolved ritual or collapsed occupant. Finish & pause remains available for between-turn adjudication.
- Live update preserves the existing encounter and DM key using a private temporary checkpoint. Prior undo history is unavailable after this server restart; future undo operates normally.
- Interaction review: no blocking findings. Deferred scaling concern: the same forecast is recomputed for each player connection; ordinary party sizes are fast, but a hypothetical 100-player scene would benefit from shared projection caching.
- Interaction verification: 41 automated tests pass. Real Chrome verifies pending-player placement by drag/drop, waiting-actor movement, Grey Man dragging, actor icon types, repeated player turns, ritual phase/zone details, and atomic turn advancement.
