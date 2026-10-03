# Temporal Atrium encounter tracker

## Intent

Build a small local-first web app for a DM running the Temporal Atrium encounter. Players on the same network see a simplified live timeline on their own devices. Prioritise correct temporal scheduling, readable controls, and clean modern styling over framework complexity. No accounts or permanent storage are required.

The referenced design establishes continuous time, thirteen physical zones, pillars that slow zones, a DM-controlled ritual clock, and a Grey Man whose turns are triggered by player activity.

## Architecture

Recommended: a Node.js server, a small WebSocket library, and plain HTML/CSS/JavaScript. The server owns encounter state and validates every command. A pure scheduling module supports automated tests with Node's built-in test runner. No database or frontend build pipeline.

Alternatives considered: server-sent events plus HTTP commands would also work but split communication across two transports; a hosted application adds deployment and persistence concerns unnecessary for this local-network encounter.

The host starts the app with `npm start`. Startup prints the shared landing-page URL using available LAN addresses and a private DM access token. The landing page offers DM or Player. Selecting DM requires the host token (or uses it from a private host link); selecting the role alone does not grant control. Player connections receive only the public projection. State survives browser refreshes but ends when the server stops. Reconnecting clients receive a fresh snapshot. Revision checks reject stale commands from duplicate DM tabs.

## Temporal rules

Global time advances only when the DM begins the next event. Turns take no additional global ticks; completing an actor's turn schedules its next activation using its final zone. Only one event can be active at a time.

| Rate step | -6 | -5 | -4 | -3 | -2 | -1 | 0 | +1 | +2 | +3 | +4 | +5 | +6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Delay in ticks | 48 | 36 | 24 | 18 | 16 | 14 | 12 | 10 | 8 | 6 | 5 | 4 | 3 |

Rate is 12 divided by delay. Physical zone and current rate step are separate values. Slowing a pillar reduces its rate step by one, to a minimum of -6, and lasts until reset or deliberately restored by the DM.

Waiting actors change schedule immediately on movement or a pillar change:

```
remainingFraction = clamp((nextActivation - now) / oldDelay, 0, 1)
nextActivation = now + max(0.01, remainingFraction * newDelay)
```

Use the actor's current effective delay on every change. Preserve actual last-activation time for history, not as the origin for repeated rescheduling. An unchanged rate is a no-op. Active actors retain their current turn and receive their next delay when it finishes. Time never moves backwards. Calculations retain full precision; formatting alone rounds tick values.

## Registration, placement, and encounter start

The first screen offers DM or Player and lists registered, non-removed player characters by character name. Selecting an existing character opens its read-only player view without creating another registration, including from another browser after a disconnect. No rejoin credential is required to view an existing character on this trusted local network. Player registration requires Player Name, Character Name, and a finite numeric Initiative Roll. Submitting creates one PC in the shared roster, initially in zone 0 and marked awaiting placement. The browser remembers the selected character for refresh/reconnection; an idempotency key prevents a retried registration submission creating duplicate characters. Player names are registration metadata visible to the DM; public timelines use character names. Players cannot change zones or control the encounter.

The DM can remove any character, including an accidental or unplaced registration. Removal immediately excludes it from the chooser, roster, and future activation queue. If it is currently acting, clear that active turn without counting it as completed. Connected viewers of the removed character return to the chooser with an explanatory message. Removal is covered by DM undo; it does not silently change the configured Grey Man party size.

The encounter begins in setup mode at tick zero. The DM assigns each PC a surviving starting zone and explicitly confirms placement, including characters starting in zone 0. The DM can also add enemies and NPCs. Begin encounter is separate from ritual START and is unavailable until all registered PCs are placed. Setup edits recompute a preview without consuming turns or advancing time.

Initial sequencing: sort the initial roster by descending initiative, breaking ties by stable insertion order. For zero-based rank r among M actors, seed the remaining interval fraction as r / M, then set first activation to that fraction times the starting zone's current delay. Thus the highest initiative acts at tick zero; the rest begin partway through a wait. At equal rates this preserves initiative order, while different starting rates can reorder first turns. Finalise these seeds once on Begin encounter. Setup placement changes recompute this preview directly and do not apply the epsilon rule for already-running waits.

After the encounter begins, registration creates a pending PC for DM placement without reseeding existing actors. Confirming that PC's placement schedules its first turn one full interval from the current tick. Other actors added mid-encounter likewise wait one full interval at their entry zone. Later simultaneous actor events use descending initiative, then insertion order.

## Ritual and collapse

The ritual starts idle with no planned ritual events. Its clock uses global encounter ticks, independent of actor rates. The DM adjudicates whether game actions satisfy or disrupt the ritual's conditions and controls the clock:

- **START:** valid while idle, after the encounter begins. Conditions have been met; schedule the next phase at current tick + 12 and enter running state.
- **DELAY:** valid while running with a scheduled phase. Add 6 ticks to its existing due time, not to the current time. Repeated delays accumulate.
- **INTERRUPT:** valid while running. Remove all pending ritual events and enter suspended state. Retain completed phases and collapsed zones.
- **RESUME:** valid while suspended. Schedule the next unfinished phase at current tick + 12 and enter running state. Do not preserve the interrupted phase's remaining wait.

Keep only the next phase scheduled, preventing stale later events after changes. When it becomes due, show it as the current event and let the DM Resolve phase. Resolving advances progress, collapses the outermost surviving pair (±6 through ±1), and, while the ritual remains running, schedules the following phase 12 ticks later. This models uninterrupted progress after START; DELAY and INTERRUPT represent adverse game actions. The sixth resolved phase completes the ritual, leaves the centre, and schedules nothing further.

A due but unresolved phase can still be delayed or interrupted: clear the current ritual event and reschedule or suspend it respectively, without advancing progress or collapsing zones. Resolved phases are not reversed by interrupting. Completed rituals disable all four clock controls. Ritual controls never interrupt an active actor turn. Log each clock change and update every timeline immediately.

Actors in collapsed zones are flagged and excluded from activation until the DM moves them to a surviving zone or removes them. Resolution is required before advancing the encounter. Moving them preserves their remaining wait using the same rate-change rule. Collapsed zones cannot receive new actors.

At an equal tick, resolve ritual pulses before pending Grey Man turns, then normal actors. Never interrupt an active turn.

## Grey Man

The DM enables him when he arrives. His counter starts at zero and counts completed PC turns only, including repeated turns by one PC. Every N completed PC turns queues one immediate Grey Man activation after the current turn. N is a displayed party-size setting, initially derived from the roster and fixed when he is enabled so removing a PC does not silently change the encounter difficulty. The DM can explicitly adjust it. He ignores zone rates. No counter accumulates while he is absent, and NPC or enemy turns do not increment it.

## DM experience

A restrained light interface with clear typography, generous spacing, subtle borders, and distinct actor, ritual, and Grey Man accents. Colour is always accompanied by labels. Desktop layout places the timeline centrally, with roster and encounter controls alongside it; narrow screens stack panels.

Controls cover actor name, initiative, type (PC, enemy/group, NPC), entry zone, movement, removal, pillar slowing/restoration, Grey Man arrival and party size, ritual START / DELAY (+6) / INTERRUPT / RESUME controls, and due-phase resolution. An explicit Begin next / Finish turn flow prevents accidental activation counts. Include an empty encounter, an optional example encounter, reset confirmation, undo of the last command, connection status, and copyable player links.

The thirteen-zone strip shows rate, occupants, slowed status, and collapse. The timeline shows exact ticks to the DM. Changes visibly highlight affected actors and record old/new activation times in a compact history. Respect reduced-motion settings and support keyboard controls through native form elements.

## Player experience

After registration, players see a waiting-for-placement/setup state until their character is scheduled. A rejoin link returns to their own character. Show the current event, personal zone/rate, and upcoming events through the earliest of their next activation, the next ritual pulse, or a 12-tick horizon. Include the boundary event; truncate by event order when multiple events share its tick. When no ritual phase is scheduled, omit that boundary and use the personal next activation or 12-tick horizon. During setup, show waiting status rather than a live queue.

Hide exact ticks and DM controls. The server filters the data, rather than transmitting the entire DM state and hiding it in CSS. Projections assume no further movement or pillar changes and stop at the next unresolved pulse because its outcome is unknown. Grey Man information appears only after the DM enables him. Live reordering is highlighted on each update.

## Scope limits

This is an encounter tracker, not a virtual tabletop. Reactions, readied actions, hit points, concentration, spell durations, and rescue outcomes remain DM adjudication. Effects measured in creature turns are tracked at the table. Monster groups can be represented as single actors. No hosted deployment, account system, or permanent persistence is included.

## Verification

Automated tests cover the 26→27 worked rescheduling example; acceleration and deceleration; repeated changes at one tick and across elapsed time; unchanged rates; movement versus pillar equivalence; progress bounds and epsilon; active-turn movement; initiative ties; initial rate-weighted seeding; setup placement and preview recomputation; required registration fields; duplicate submission/reconnection; rejoining through the public character list; removal of pending, waiting, and active characters; connected-viewer removal handling; late player placement without reseeding; mid-encounter entry; Grey Man counting and event precedence; idle ritual with no events; START and RESUME at now + 12; cumulative DELAY from the existing due time; INTERRUPT removing pending events while preserving progress; delay/interruption of a due unresolved phase; invalid ritual transitions; all six collapses; collapsed-zone adjudication; undo; public-view horizons and absence of DM-only state; and invalid/stale/unauthorised commands.

Verify a running DM and player client receive consistent live changes, reconnect successfully, and cannot issue DM commands; confirm registration is the only unauthenticated roster-creation operation and is validated and bounded. Inspect desktop and narrow-screen layouts and exercise an encounter from setup through a pulse and Grey Man activation.
