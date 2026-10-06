import test from "node:test";
import assert from "node:assert/strict";
import { createEncounter, applyCommand } from "../src/encounter.js";
import {
  forecast,
  publicRoster,
  playerView,
  dmView,
} from "../src/projection.js";
function fixture() {
  let s = createEncounter();
  for (const [name, initiative, zone] of [
    ["Mira", 20, 6],
    ["Torren", 10, 0],
  ])
    s = applyCommand(s, {
      type: "addActor",
      name,
      initiative,
      zone,
      actorType: "pc",
      playerName: "Private player",
    });
  return applyCommand(s, { type: "beginEncounter" });
}
test("chooser roster exposes only character names and IDs and omits removed PCs", () => {
  let s = fixture();
  assert.deepEqual(Object.keys(publicRoster(s)[0]).sort(), ["id", "name"]);
  s = applyCommand(s, { type: "removeActor", id: s.actors[0].id });
  assert.equal(publicRoster(s).length, 1);
});
test("player view includes all actors and repeated turns across the full twelve tick window", () => {
  const s = fixture();
  s.actors[1].nextActivation = 0;
  const p = playerView(s, s.actors[0].id);
  assert.equal(p.events.length, 7);
  assert.equal(p.events[0].name, "Mira");
  const json = JSON.stringify(p);
  for (const secret of [
    "Private player",
    "nextActivation",
    "initiative",
    "history",
    '"at"',
    '"now"',
  ])
    assert.equal(json.includes(secret), false);
});
test("forecast repeats fast actors without changing state and stops at unresolved ritual", () => {
  let s = fixture();
  s = applyCommand(s, { type: "ritualStart" });
  const before = structuredClone(s);
  const f = forecast(s, { horizon: 48, maxEvents: 100 });
  assert.equal(f.events.at(-1).kind, "ritual");
  assert.equal(f.events.at(-1).at, 12);
  assert.ok(f.events.filter((e) => e.name === "Mira").length >= 4);
  assert.deepEqual(s, before);
});
test("no ritual still produces bounded forecasts and player horizon", () => {
  const s = fixture();
  s.actors[1].nextActivation = 48;
  const p = playerView(s, s.actors[1].id);
  assert.equal(p.events.length, 5);
  assert.equal(p.events.at(-1).name, "Mira");
  assert.equal(forecast(s, { horizon: 100, maxEvents: 2 }).truncated, true);
});
test("setup and removed player views cannot masquerade as a live character", () => {
  const s = createEncounter();
  assert.equal(playerView(s, "missing").removed, true);
  const registered = applyCommand(s, {
    type: "register",
    name: "Mira",
    playerName: "Sam",
    initiative: 20,
  });
  const p = playerView(registered, registered.actors[0].id);
  assert.equal(p.waiting, true);
  assert.deepEqual(p.events, []);
});
test("DM view includes history, ticks and placement details", () => {
  const s = fixture(),
    p = dmView(s);
  assert.equal(p.now, 0);
  assert.ok(p.history.length);
  assert.equal(p.actors[0].playerName, "Private player");
  assert.equal(p.events[0].at, 0);
});
test("forecast completes active turn once and can project Grey Man", () => {
  let s = fixture();
  s = applyCommand(s, {
    type: "configureGreyMan",
    enabled: true,
    partySize: 1,
  });
  s = applyCommand(s, { type: "beginNext" });
  const f = forecast(s, { horizon: 12, maxEvents: 30 });
  assert.equal(f.events[0].kind, "grey");
  assert.equal(f.events[0].at, 0);
});
test("public event identities do not encode exact ticks", () => {
  const s = fixture();
  s.actors[0].nextActivation = 7.123456;
  const p = playerView(s, s.actors[0].id);
  assert.equal(JSON.stringify(p).includes("7.123456"), false);
});
test("DM can advance to events beyond the preview horizon", () => {
  let s = fixture();
  for (const a of s.actors)
    s = applyCommand(s, { type: "removeActor", id: a.id });
  s = applyCommand(s, { type: "ritualStart" });
  for (let i = 0; i < 7; i++) s = applyCommand(s, { type: "ritualDelay" });
  const d = dmView(s);
  assert.equal(d.events.length, 0);
  assert.equal(d.hasNext, true);
  assert.equal(d.nextEvent.at, 54);
});
test("player forecast continues past ritual phases, annotates collapse and leaves live state unchanged", () => {
  let s = fixture();
  s.actors[0].zone = 0;
  s.actors[0].nextActivation = 4;
  s.actors[1].nextActivation = 8;
  s = applyCommand(s, { type: "ritualStart" });
  s.ritual.next = 6;
  s.ritual.progress = 1;
  const before = structuredClone(s),
    p = playerView(s, s.actors[0].id);
  assert.deepEqual(
    p.events.map((e) => e.kind),
    ["actor", "ritual", "actor"],
  );
  const r = p.events[1];
  assert.equal(r.ritualPhase, 2);
  assert.equal(r.collapseZone, 5);
  assert.deepEqual(s, before);
});
test("player forecast shows survivors after an active ritual and excludes projected collapsed occupants", () => {
  let s = fixture();
  s.actors[0].nextActivation = 7;
  s.actors[1].nextActivation = 8;
  s = applyCommand(s, { type: "ritualStart" });
  s.ritual.next = 6;
  s = applyCommand(s, { type: "beginNext" });
  const p = playerView(s, s.actors[1].id);
  assert.equal(p.events[0].name, "Torren");
  assert.equal(
    p.events.some((e) => e.name === "Mira"),
    false,
  );
  assert.equal(s.actors[0].removed, false);
});

test("player coming up contains every event through twelve ticks even with more than twelve entries", () => {
  let s = createEncounter();
  for (let i = 0; i < 15; i++)
    s = applyCommand(s, {
      type: "addActor",
      name: `Player ${i}`,
      playerName: "Player",
      actorType: "pc",
      initiative: i,
      zone: 6,
    });
  s = applyCommand(s, { type: "beginEncounter" });
  const projected = forecast(s, {
    horizon: 12,
    maxEvents: 2000,
    throughRitual: true,
  });
  assert.ok(projected.events.length > 12);
  assert.ok(projected.events.every((e) => e.at <= s.now + 12));
  assert.deepEqual(
    playerView(s, s.actors[0].id).events.map((e) => e.key),
    projected.events.map((e) => e.key),
  );
});
test("skipping a selected forecast row removes that occurrence without consuming earlier turns", () => {
  let s = fixture();
  const id = s.actors[0].id;
  s = applyCommand(s, { type: "skipActor", id, occurrence: 1 });
  assert.deepEqual(
    forecast(s, { horizon: 12 })
      .events.filter((e) => e.id === id)
      .map((e) => e.at),
    [0, 6, 9, 12],
  );
});

test("DM coming up continues through scheduled ritual phases without changing the encounter", () => {
  const s = applyCommand(fixture(), { type: "ritualStart" });
  const before = structuredClone(s),
    d = dmView(s);
  assert.ok(d.events.some((e) => e.kind === "actor" && e.at > 12));
  assert.deepEqual(
    d.events.filter((e) => e.kind === "ritual").map((e) => e.ritualPhase),
    [1, 2, 3, 4],
  );
  assert.equal(
    d.events.some((e) => e.id === s.actors[0].id && e.at >= 12),
    false,
  );
  assert.deepEqual(s, before);
});
test("DM preview remains populated while a ritual phase awaits resolution", () => {
  let s = applyCommand(fixture(), { type: "ritualStart" });
  s.actors[0].nextActivation = 13;
  s.actors[1].nextActivation = 14;
  s = applyCommand(s, { type: "beginNext" });
  const before = structuredClone(s),
    d = dmView(s);
  assert.equal(d.active.kind, "ritual");
  assert.ok(d.events.some((e) => e.name === "Torren" && e.at === 14));
  assert.ok(d.events.some((e) => e.kind === "ritual" && e.ritualPhase === 2));
  assert.deepEqual(s, before);
});
