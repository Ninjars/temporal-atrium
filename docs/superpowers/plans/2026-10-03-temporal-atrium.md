# Temporal Atrium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local encounter tracker with correct temporal scheduling, DM controls, player registration/rejoining, and live limited player timelines.

**Architecture:** One authoritative Node.js process serves static files and WebSocket snapshots. Pure encounter and projection modules isolate rules from transport and browser rendering. State stays in memory.

**Tech Stack:** Node.js 22 or newer, ES modules, `ws`, native HTML/CSS/JavaScript, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-03-temporal-atrium-design.md`

## Global Constraints

- No database or frontend build pipeline.
- State survives browser refreshes but ends when the server stops.
- Time never moves backwards.
- Calculations retain full precision; formatting alone rounds tick values.
- Player connections receive only the public projection.
- Ritual clock controls: START at now + 12, DELAY due time + 6, INTERRUPT removes pending ritual events, RESUME at now + 12.
- Delay table for steps -6 through +6: 48, 36, 24, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3.

## Review Focus

- Duplicate registration delivery creates exactly one PC; task 3 tests retries.
- Removal during an active turn clears it without incrementing Grey Man; task 2 tests this transition.
- Reconnection after removal returns to the chooser; task 4 checks connected and disconnected clients.
- Hostile character names render as text and never HTML; task 4 checks markup-shaped names.
- Stale commands after undo are rejected; task 3 tests monotonic revisions independent of restored state.

## File responsibilities

- `package.json`, `package-lock.json`, `.gitignore`: runtime, dependency lock, start/test commands.
- `src/timing.js`: delay lookup, rescheduling, initial seeding, deterministic event comparison.
- `src/encounter.js`: state factory and validated command reducer.
- `src/projection.js`: DM queue forecast, bounded player view, public character list.
- `src/server.js`: HTTP assets, WebSocket roles/commands, undo, revisions and startup links.
- `public/index.html`, `public/styles.css`: accessible shell and responsive visual system.
- `public/app.js`: connection, registration, role routing and reconnect state.
- `public/dm.js`, `public/player.js`, `public/ui.js`: view rendering and safe DOM helpers.
- `test/timing.test.js`, `test/encounter.test.js`, `test/projection.test.js`, `test/server.test.js`: automated rule and integration checks.
- `README.md`: startup, LAN joining, encounter operation, rules and state lifetime.

## Task 1: Temporal scheduling primitives

**Interfaces:** `delayFor(step): number`; `reschedule({now,next,oldDelay,newDelay}): number`; `seedActors(actors,zones): Actor[]`; `compareEvents(a,b): number`. Actors have stable IDs/insertion order, initiative, zone, type, placed/removed flags, lastActivation and nextActivation. Zones have physical ID, rate step and collapsed flag.

- [ ] Write `test/timing.test.js`: assert `reschedule({now:23,next:26,oldDelay:6,newDelay:8}) === 27`; changing 8→12 immediately yields 29; changing 8→12 at tick 24 yields 28.5. Assert unchanged rates preserve next, overdue waits become now + 0.01, and invalid/nonfinite delays reject. Assert seeding two equal-rate actors yields ticks 0 and 6, while the second actor in +6 yields 1.5. Assert stable initiative ties and all thirteen delay values.
- [ ] Run `node --test test/timing.test.js`; expect missing-module failure before implementation.
- [ ] Create ES-module package configuration and `src/timing.js`. Event ordering is tick, ritual/Grey Man/actor precedence, descending initiative, stable insertion order. Seed using zero-based rank / roster size times zone delay.
- [ ] Run `node --test test/timing.test.js`; expect all tests passing. Commit this independently testable unit.

## Task 2: Encounter commands and public projection

**Interfaces:** `createEncounter(): State`; `applyCommand(state, command): State` returns a new state or throws without changing its input; `forecast(state, {horizon,maxEvents}): Event[]`; `publicRoster(state): {id,characterName}[]`; `playerView(state, actorId): PlayerView`; `dmView(state): DmView`. State contains phase, now, actors, zones, active event, ritual, Grey Man and bounded history. No network credentials live in encounter state.

Commands: register, addActor, placeActor, moveActor, removeActor, beginEncounter, beginNext, finishTurn, slowPillar, restorePillar, ritualStart, ritualDelay, ritualInterrupt, ritualResume, resolvePhase, configureGreyMan. Reset/example/undo are server-level operations.

- [ ] Write encounter tests for setup placement blocking start; reseeding only in setup; late entry at now + zone delay; movement/pillar equivalence; active-turn final-zone scheduling; removed active PC not counting as completed; pending PC removal unblocking setup; and invalid commands leaving state unchanged.
- [ ] Write ritual tests: START at tick 5 yields 17; two delays yield 29; interrupt clears next phase; resume at tick 20 yields 32; due-phase delay cancels the current event; completed progress survives interruption; six resolves collapse ±6 through ±1 and stop the ritual; collapsed occupants block advancement until moved/removed.
- [ ] Write Grey Man tests: N=4 triggers on four completed PC turns, including repeated turns by one PC; NPC turns do not count; no counts before arrival; removal does not change N; ritual wins an equal-tick tie. Specify positive integer N; changing N resets its counter and pending trigger only when Grey Man is not active.
- [ ] Run `node --test test/encounter.test.js`; expect failure before implementing `src/encounter.js`. Implement validated transitions using task 1 functions, recording changes in history.
- [ ] Write projection tests: selecting a character exposes no player names, credentials, exact tick values or DM history; removed characters disappear; setup has no live timeline; cutoff includes only events through the selected actor/pulse/horizon boundary; no scheduled pulse still yields a bounded view; forecasting does not mutate state.
- [ ] Implement `src/projection.js` by simulating a cloned encounter under unchanged conditions, including repeated actor turns and Grey Man triggers, stopping before unresolved ritual outcomes. Bound forecasts to 100 events and use explicit truncation metadata.
- [ ] Run `node --test test/timing.test.js test/encounter.test.js test/projection.test.js`; expect all passing. Commit rules and projections.

## Task 3: Authoritative local server

**Interfaces:** `createServer({port,host,dmToken}): {listen,close,address}` for integration tests; direct execution starts the LAN server. WebSocket requests carry `{id,type,payload,revision}`. Types are subscribe (chooser/player/DM), register, and command. Replies are snapshot, acknowledgement or error with request ID. Only DM command requests require the host token and current revision; register has a unique retry key.

- [ ] Write `test/server.test.js` using temporary ephemeral ports and actual WebSocket clients. Assert chooser gets only public roster, player registration broadcasts one PC, duplicate retry returns the same PC, DM placement broadcasts player state, and unauthorised/stale commands reject without mutation.
- [ ] Add tests for malformed JSON, oversized messages, invalid actor IDs, empty/oversized names, nonfinite initiative, reconnect snapshots, deleted-character snapshots, and bounded roster size. Use 80-character names, 100 actors, and 16 KiB message limits. Assert undo restores encounter state but increments revision, rejecting previously valid stale commands. Undo/reset clear retry mappings that reference actors no longer present.
- [ ] Run `node --test test/server.test.js`; expect failure before implementation.
- [ ] Implement static allowlisted asset serving and WebSocket subscriptions in `src/server.js`. Validate origin against the serving host for browser clients, use a random host token, keep at most 50 undo states, and route all successful mutations through one revision/broadcast path. Never send token or full state to player/chooser connections. Add `ws` and commit its lockfile.
- [ ] Run `npm test`; expect all tests passing. Commit server integration.

## Task 4: Role chooser, DM controls and player timeline

**Interfaces:** `connect({role,actorId,token}, onSnapshot, onStatus)` and `send(type,payload)` in `public/app.js`; rendering functions receive snapshots and action callbacks only. Build user text with `textContent`, never interpolated HTML.

- [ ] Create the role chooser with the live registered-character list, DM token entry, and Player Name / Character Name / Initiative Roll form. Remember selected actor locally and registration retry key until acknowledged; existing character buttons subscribe without registration. Handle removed characters by clearing selection and returning to chooser with a message.
- [ ] Build the DM workspace with setup placement confirmation, actor/group add/remove/move, zone strip, slowed/collapsed status, forecast, active-turn controls, ritual controls with valid-state disabling, Grey Man controls, history, undo, example/reset confirmation and share links. Preserve focused form inputs across live updates.
- [ ] Build player waiting/current/upcoming views and personal zone/rate. Animate changed queue positions using stable actor/event keys; honour reduced motion. Show connection loss and disable mutation controls until a fresh snapshot arrives.
- [ ] Apply a clean light visual style, readable type, restrained teal/violet accents, strong focus indicators and mobile layouts. Use native labels/buttons/selects and textual status alongside colour.
- [ ] Run `npm test` and start the server. In browser checks, register two PCs; rejoin one from the chooser; remove the other while connected; enter a markup-shaped name and confirm literal display; place actors and start combat; move a waiting actor; slow a pillar; start/delay/interrupt/resume and resolve a ritual phase; trigger Grey Man. Verify DM and player updates agree.
- [ ] Inspect desktop and phone-width layouts, keyboard navigation and reconnect after a brief connection interruption. Fix observed defects and rerun affected checks. Commit UI.

## Task 5: Delivery and final verification

- [ ] Write `README.md` with Node requirement, `npm install`, `npm start`, `npm test`, printed LAN/DM URLs, role selection, registration/rejoining, placement, timing examples, ritual controls, removal/undo and memory-only state lifetime.
- [ ] Run `npm test` from the finished tree, inspect `git diff --check`, and repeat only browser flows affected by final fixes. Record actual results and any unavailable browser verification.
- [ ] Review changes against every spec section, with special attention to repeated rescheduling, public data filtering, ritual interruption and character cleanup. Obtain the execution workflow's final code review, address actionable findings, and rerun relevant tests.
- [ ] Commit the verified result and provide the launch command, app URL if running, and concise verification summary.
