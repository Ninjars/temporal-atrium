# Temporal Atrium

A local-first encounter tracker for a room where time flows at thirteen different rates. One DM controls the scene; players join from a browser on the same network.

## Run

Requires **Node.js 22 or newer**.

```sh
npm install
npm start
```

Open **http://localhost:3000** on the host computer. The terminal prints a private DM link/key and LAN links for players. Keep the terminal running throughout the encounter. If macOS asks, allow Node to accept incoming local-network connections. Players use the printed LAN link, not `localhost` on their phones.

Set `PORT=3001 npm start` to use a different port. `HOST=127.0.0.1 npm start` limits access to the host computer. By default, the app listens on all interfaces for local-network play. It is intended for a trusted table network, not public internet hosting.

## At the table

1. On the chooser screen, select **Dungeon Master** and paste the terminal's DM key. The private DM link pre-fills it.
2. Players select **Player** and enter their player name, character name, and initiative total. Registered characters also appear on the chooser for easy rejoining from any device. Player names are visible only to the DM.
3. The DM assigns and confirms each player's starting zone. Add enemies or NPC groups directly, or load the optional example scene to explore the controls.
4. **Begin encounter** locks the opening sequence. **Begin next event** advances the clock. Resolve the turn at the table, change positions as needed, then **Finish & next** to start the next event in the same action. Use **Finish & pause** when you need to make changes between turns. Ritual phases still require explicit resolution.
5. Drag actor rows between atrium zones, or use their zone selector. Dragging an unplaced player into a zone confirms its starting placement. The ↓ button under a zone slows its pillar one rate step; Restore returns its original rate. Waiting turns recalculate immediately.
   Use **Skip** on a Coming up row to omit that particular activation. Earlier turns and the current turn continue normally; skipped player actions do not advance the Grey Man counter.

   Use **Split** on an enemy card during combat to create a numbered copy ready for the next actor turn. Move the copy to its new zone as needed; the original is unchanged. Due ritual and Grey Man events retain precedence.

   Use **Delay +6** on an actor’s roster card to add six global ticks to its next turn. Penalties stack. A current turn continues normally; its next turn receives the penalty. Movement and pillar changes preserve the fixed penalty while rescheduling the natural wait.

6. Use the ritual clock independently of combat: **Start** schedules a phase in 12 ticks; **Delay +6** adds six ticks to its due time; **Interrupt** cancels pending ritual progress; **Resume** schedules the next unfinished phase in 12 ticks. Resolve a due phase to collapse the next outer pair. The next phase follows in 12 ticks unless delayed/interrupted. Six phases complete the ritual.
7. If actors are stranded in a collapsed zone, adjudicate their fate and move or remove them before advancing.
8. Bring in the **Grey Man** when desired. He acts after every N completed player turns, even if one fast character took several of them. Applying a new configuration resets his counter. His party size stays fixed when characters are removed. His zone is tracked for positioning and collapse, but does not affect his activation counter; he can be dragged between zones too.

Remove accidental registrations with the × button on their roster card. Removal also clears their future turns and rejoin entry. **Undo last change** restores the previous scene state, including removed actors. Up to 50 changes are retained. Undo is global, so check Recent changes before using it in a busy session.

## Timing rules

Normal time is one activation every 12 ticks. Zone delays from −6 to +6 are:

| Zone  | −6  | −5  | −4  | −3  | −2  | −1  | 0   | +1  | +2  | +3  | +4  | +5  | +6  |
| ----- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Delay | 48  | 36  | 24  | 18  | 16  | 14  | 12  | 10  | 8   | 6   | 5   | 4   | 3   |

Waiting actors preserve their remaining progress on movement or pillar changes:

```text
remaining fraction = clamp((next activation − current tick) / old delay, 0, 1)
next activation = current tick + max(0.01, remaining fraction × new delay)
```

An unchanged rate preserves the existing timestamp. Repeated changes use the current interval, preserving progress already earned. Active turns complete normally and use the actor's final zone for their next interval.

At setup, actors sort by descending initiative, with registration/insertion order breaking ties. First activation is `rank / actor count × starting-zone delay`, with rank starting at zero. This preserves initiative at equal rates while allowing starting positions to alter the opening order. Late arrivals wait a full interval after DM placement; existing turns are never reseeded.

At equal ticks: ritual phase, then triggered Grey Man, then normal actors by initiative. No event interrupts an active turn.

Player views show current activity and all upcoming events in the next twelve ticks. Forecasts assume scheduled ritual phases succeed and exclude subsequent turns for occupants of projected collapsed zones. Delaying or interrupting the ritual updates the forecast immediately. Ritual rows identify the phase and both zones that will collapse. Exact ticks, DM history, and private player metadata remain excluded from player messages. The DM preview covers up to 48 ticks and continues through projected ritual phases.

Actor symbols are consistent throughout: blue ◆ player, green ● NPC, red ▲ enemy, and emphasized red ✦ Grey Man.

## State and recovery

State lives in the server's memory. Browser refreshes and reconnects preserve it; restarting the server clears it. Returning players can select their character on the chooser. This read-only rejoin flow needs no password. Only the DM key grants control.

There are no accounts, database, external fonts, analytics, or hosted services. Hit points, reactions, concentration, and effect durations are adjudicated at the table.

## Verify

```sh
npm test
```

The suite uses Node's built-in test runner and actual local WebSocket connections. It covers scheduling, repeated rescheduling, setup/placement, ritual controls, collapse, Grey Man triggers, projections, registration retries, undo/revision handling, and DM-only mutations.

An optional Chrome acceptance test is also included. With Playwright available, run `node test/browser.e2e.mjs`; alternatively pass the absolute path to a Playwright module as its first argument. It launches an isolated temporary encounter and exercises the DM/player UI, including reconnect, invitation fallback, and mobile overflow checks. It requires an installed Google Chrome browser.

Design and implementation decisions are recorded in `docs/decisions.md`; the full specification and implementation plan are under `docs/superpowers/`.

## License

[MIT](LICENSE) © 2026 Jez (Ninjars).
