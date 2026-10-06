import test from "node:test";
import assert from "node:assert/strict";
import { createEncounter, applyCommand, nextEvents } from "../src/encounter.js";
const cmd = (s, type, payload = {}) => applyCommand(s, { type, ...payload });
function ready(type = "pc") {
  let s = createEncounter();
  s = cmd(s, "addActor", {
    name: "Mira",
    playerName: "Sam",
    actorType: type,
    initiative: 20,
    zone: 0,
  });
  return cmd(s, "beginEncounter");
}
test("registration requires placement and removing accidental registrations unblocks setup", () => {
  let s = cmd(createEncounter(), "register", {
    name: "Mira",
    playerName: "Sam",
    initiative: 20,
  });
  assert.throws(() => cmd(s, "beginEncounter"), /place/i);
  const id = s.actors[0].id;
  s = cmd(s, "placeActor", { id, zone: 6 });
  s = cmd(s, "register", { name: "Mistake", playerName: "Sam", initiative: 1 });
  s = cmd(s, "removeActor", { id: s.actors[1].id });
  s = cmd(s, "beginEncounter");
  assert.equal(s.actors[0].nextActivation, 0);
  assert.equal(s.phase, "running");
});
test("late registration does not reseed existing actors and awaits placement", () => {
  let s = ready();
  const next = s.actors[0].nextActivation;
  s = cmd(s, "register", { name: "Late", playerName: "Lee", initiative: 30 });
  assert.equal(s.actors[0].nextActivation, next);
  assert.equal(s.actors[1].nextActivation, null);
  s = cmd(s, "placeActor", { id: s.actors[1].id, zone: 6 });
  assert.equal(s.actors[1].nextActivation, 3);
});
test("active movement uses final zone on completion and counts one PC turn", () => {
  let s = ready();
  s = cmd(s, "configureGreyMan", { enabled: true, partySize: 4 });
  s = cmd(s, "beginNext");
  s = cmd(s, "moveActor", { id: s.actors[0].id, zone: 6 });
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[0].nextActivation, 3);
  assert.equal(s.grey.count, 1);
  assert.throws(() => cmd(s, "finishTurn"));
});
test("removing an active character clears its turn without counting completion", () => {
  let s = ready();
  s = cmd(s, "configureGreyMan", { enabled: true, partySize: 4 });
  s = cmd(s, "beginNext");
  s = cmd(s, "removeActor", { id: s.actors[0].id });
  assert.equal(s.active, null);
  assert.equal(s.grey.count, 0);
  assert.equal(s.grey.partySize, 4);
  assert.deepEqual(nextEvents(s), []);
});
test("movement and pillar slowing preserve equivalent progress", () => {
  let s = ready();
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  s.now = 6;
  const moved = cmd(s, "moveActor", { id: s.actors[0].id, zone: -1 });
  const slowed = cmd(s, "slowPillar", { zone: 0 });
  assert.equal(moved.actors[0].nextActivation, 13);
  assert.equal(slowed.actors[0].nextActivation, 13);
  assert.equal(s.actors[0].nextActivation, 12);
});
test("ritual clock starts idle, delays from due time and resumes from now", () => {
  let s = ready();
  s.now = 5;
  assert.equal(s.ritual.next, null);
  s = cmd(s, "ritualStart");
  assert.equal(s.ritual.next, 17);
  s = cmd(cmd(s, "ritualDelay"), "ritualDelay");
  assert.equal(s.ritual.next, 29);
  s = cmd(s, "ritualInterrupt");
  assert.equal(s.ritual.next, null);
  assert.equal(s.ritual.status, "suspended");
  s.now = 20;
  s = cmd(s, "ritualResume");
  assert.equal(s.ritual.next, 32);
  assert.throws(() => cmd(s, "ritualStart"));
  assert.throws(() => cmd(createEncounter(), "ritualStart"));
});
test("due unresolved ritual phase can be delayed or interrupted", () => {
  let s = ready();
  s = cmd(s, "removeActor", { id: s.actors[0].id });
  s = cmd(s, "ritualStart");
  s = cmd(s, "beginNext");
  assert.equal(s.active.kind, "ritual");
  const delayed = cmd(s, "ritualDelay");
  assert.equal(delayed.active, null);
  assert.equal(delayed.ritual.next, 18);
  assert.equal(delayed.ritual.progress, 0);
  const interrupted = cmd(s, "ritualInterrupt");
  assert.equal(interrupted.active, null);
  assert.equal(interrupted.ritual.next, null);
});
test("six ritual phases collapse outer pairs and complete", () => {
  let s = ready();
  s = cmd(s, "removeActor", { id: s.actors[0].id });
  s = cmd(s, "ritualStart");
  for (let i = 1; i <= 6; i++) {
    s = cmd(s, "beginNext");
    s = cmd(s, "resolvePhase");
    assert.equal(s.ritual.progress, i);
    assert.equal(s.zones.filter((z) => z.collapsed).length, i * 2);
  }
  assert.equal(s.ritual.status, "complete");
  assert.equal(s.ritual.next, null);
  assert.equal(s.now, 72);
  assert.throws(() => cmd(s, "ritualResume"));
});
test("collapse blocks advancement until stranded characters are moved or removed", () => {
  let s = ready();
  s.actors[0].zone = 6;
  s.actors[0].nextActivation = 20;
  s = cmd(s, "ritualStart");
  s = cmd(s, "beginNext");
  s = cmd(s, "resolvePhase");
  assert.throws(() => cmd(s, "beginNext"), /collapsed/i);
  assert.throws(() =>
    cmd(s, "addActor", {
      name: "Bad",
      actorType: "enemy",
      initiative: 1,
      zone: 6,
    }),
  );
  s = cmd(s, "moveActor", { id: s.actors[0].id, zone: 0 });
  assert.doesNotThrow(() => cmd(s, "beginNext"));
  s = cmd(s, "ritualInterrupt");
  assert.equal(s.ritual.progress, 1);
});
test("Grey Man triggers on repeated PC completions, ignores other actors and stays off-clock", () => {
  let s = ready();
  s = cmd(s, "configureGreyMan", { enabled: true, partySize: 4 });
  for (let i = 0; i < 4; i++) {
    s = cmd(s, "beginNext");
    s = cmd(s, "finishTurn");
  }
  assert.equal(s.grey.pending, true);
  s = cmd(s, "beginNext");
  assert.equal(s.active.kind, "grey");
  const now = s.now;
  s = cmd(s, "finishTurn");
  assert.equal(s.now, now);
  assert.equal(s.grey.count, 0);
  let enemy = cmd(ready("enemy"), "configureGreyMan", {
    enabled: true,
    partySize: 1,
  });
  enemy = cmd(cmd(enemy, "beginNext"), "finishTurn");
  assert.equal(enemy.grey.pending, false);
});
test("equal-tick ritual precedes Grey Man and normal actors", () => {
  let s = ready();
  s.now = 12;
  s.actors[0].nextActivation = 12;
  s.ritual = { status: "running", progress: 0, next: 12 };
  s.grey = { enabled: true, partySize: 1, count: 0, pending: true };
  assert.deepEqual(
    nextEvents(s).map((e) => e.kind),
    ["ritual", "grey", "actor"],
  );
});
test("invalid actor fields and commands cannot mutate state", () => {
  const s = createEncounter();
  for (const payload of [
    { name: "", initiative: 1 },
    { name: "A", initiative: Infinity },
    { name: "A", initiative: "2" },
    { name: "A".repeat(81), initiative: 2 },
  ])
    assert.throws(() => cmd(s, "register", { playerName: "B", ...payload }));
  assert.throws(() => cmd(s, "unknown"));
  assert.deepEqual(s, createEncounter());
});
test("roster bounds reject excess actors without corrupting existing placements", () => {
  let s = createEncounter();
  for (let i = 0; i < 100; i++)
    s = cmd(s, "register", {
      name: `PC ${i}`,
      playerName: "Player",
      initiative: i,
    });
  assert.throws(
    () =>
      cmd(s, "register", {
        name: "Overflow",
        playerName: "Player",
        initiative: 1,
      }),
    /100/,
  );
  assert.equal(s.actors.length, 100);
});
test("restoring a slowed pillar accelerates waiting actors using current progress", () => {
  let s = ready();
  s = cmd(cmd(s, "beginNext"), "finishTurn");
  s.now = 6;
  s = cmd(s, "slowPillar", { zone: 0 });
  s.now = 7;
  s = cmd(s, "restorePillar", { zone: 0 });
  assert.ok(Math.abs(s.actors[0].nextActivation - (7 + 36 / 7)) < 1e-10);
});
test("finish and advance completes exactly one turn and starts the next atomically", () => {
  let s = ready();
  s = cmd(s, "configureGreyMan", { enabled: true, partySize: 1 });
  s = cmd(s, "beginNext");
  s = cmd(s, "finishAndAdvance");
  assert.equal(s.active.kind, "grey");
  assert.equal(s.now, 0);
  assert.equal(s.actors[0].nextActivation, 12);
  s = cmd(s, "finishAndAdvance");
  assert.equal(s.active.kind, "actor");
  assert.equal(s.now, 12);
});
test("automatic advance stops on a ritual without resolving it and allows a deliberate pause", () => {
  let s = ready();
  s = cmd(s, "ritualStart");
  s = cmd(s, "beginNext");
  s = cmd(s, "finishAndAdvance");
  assert.equal(s.active.kind, "ritual");
  assert.equal(s.ritual.progress, 0);
  s = cmd(s, "resolvePhase");
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  assert.equal(s.active, null);
});
test("Grey Man position is independent of scheduling and a collapsed zone blocks advancement", () => {
  let s = ready();
  s = cmd(s, "configureGreyMan", { enabled: true, partySize: 1 });
  s = cmd(s, "moveGreyMan", { zone: 6 });
  s = cmd(s, "beginNext");
  s = cmd(s, "finishAndAdvance");
  assert.equal(s.active.kind, "grey");
  assert.equal(s.grey.zone, 6);
  s = cmd(s, "moveGreyMan", { zone: -6 });
  assert.equal(s.grey.pending, true);
  assert.equal(s.now, 0);
  s = cmd(s, "finishTurn");
  s.zones.find((z) => z.id === -6).collapsed = true;
  assert.throws(() => cmd(s, "beginNext"), /collapsed/i);
  s = cmd(s, "moveGreyMan", { zone: 0 });
  assert.doesNotThrow(() => cmd(s, "beginNext"));
});

test("delay penalties reorder waiting actors immediately and stack", () => {
  let s = ready();
  s = cmd(s, "addActor", {
    name: "Spider",
    actorType: "enemy",
    initiative: 10,
    zone: 6,
  });
  const id = s.actors[0].id;
  s = cmd(s, "delayActor", { id });
  assert.equal(s.now, 0);
  assert.equal(s.actors[0].nextActivation, 6);
  assert.equal(nextEvents(s)[0].name, "Spider");
  s = cmd(s, "delayActor", { id });
  assert.equal(s.actors[0].nextActivation, 12);
});
test("active penalties defer to the next turn and are consumed only once", () => {
  let s = cmd(ready(), "beginNext"),
    id = s.actors[0].id;
  s = cmd(s, "delayActor", { id });
  s = cmd(s, "delayActor", { id });
  assert.equal(s.active.id, id);
  assert.equal(s.now, 0);
  s = cmd(s, "moveActor", { id, zone: 6 });
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[0].nextActivation, 15);
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[0].nextActivation, 18);
});
test("movement preserves fixed tick penalties while rescaling the natural wait", () => {
  let s = ready(),
    id = s.actors[0].id;
  s = cmd(cmd(s, "beginNext"), "finishTurn");
  s = cmd(s, "delayActor", { id });
  s.now = 6;
  s = cmd(s, "moveActor", { id, zone: 6 });
  assert.equal(s.actors[0].nextActivation, 13.5);
  s.now = 10;
  s = cmd(s, "moveActor", { id, zone: 0 });
  assert.equal(s.actors[0].nextActivation, 13.5);
});
test("penalties reject setup, unplaced and removed actors without changing state", () => {
  let s = createEncounter();
  assert.throws(() => cmd(s, "delayActor", { id: "missing" }));
  s = ready();
  s = cmd(s, "register", { name: "Late", playerName: "Sam", initiative: 10 });
  assert.throws(() => cmd(s, "delayActor", { id: s.actors[1].id }));
  const id = s.actors[0].id;
  s = cmd(s, "removeActor", { id });
  assert.throws(() => cmd(s, "delayActor", { id }));
});

test("splitting enemies copies placement and schedules the copy next without interrupting", () => {
  let s = ready("enemy");
  const original = s.actors[0];
  s = cmd(s, "beginNext");
  s = cmd(s, "splitActor", { id: original.id });
  const copy = s.actors[1];
  assert.equal(copy.name, "Mira 1");
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.zone, original.zone);
  assert.equal(copy.initiative, original.initiative);
  assert.equal(s.active.id, original.id);
  s = cmd(s, "moveActor", { id: copy.id, zone: -6 });
  assert.equal(nextEvents(s)[0].id, copy.id);
  assert.equal(nextEvents(s)[0].at, s.now);
  s = cmd(s, "finishAndAdvance");
  assert.equal(s.active.id, copy.id);
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[1].nextActivation, 48);
});
test("split naming increments two-digit suffixes and skips existing names", () => {
  let s = ready("enemy");
  s.actors[0].name = "Spiders 9";
  s = cmd(s, "splitActor", { id: s.actors[0].id });
  s = cmd(s, "splitActor", { id: s.actors[0].id });
  assert.deepEqual(
    s.actors.map((a) => a.name),
    ["Spiders 9", "Spiders 10", "Spiders 11"],
  );
  assert.equal(nextEvents(s)[0].id, s.actors[2].id);
  s.actors[0].name = "Spiders 99";
  assert.throws(() => cmd(s, "splitActor", { id: s.actors[0].id }), /99/);
});
test("splitting rejects non-enemies and clears copied penalties", () => {
  const pc = ready();
  assert.throws(() => cmd(pc, "splitActor", { id: pc.actors[0].id }), /enemy/i);
  let s = ready("enemy");
  s = cmd(s, "delayActor", { id: s.actors[0].id });
  s = cmd(s, "splitActor", { id: s.actors[0].id });
  assert.equal(s.actors[1].delayPenalty, 0);
  assert.equal(nextEvents(s)[0].id, s.actors[1].id);
  s = cmd(s, "delayActor", { id: s.actors[1].id });
  assert.equal(s.actors[1].nextActivation, 6);
});

test("skipping a waiting PC turn leaves the clock and Grey Man counter unchanged", () => {
  let s = ready();
  s = cmd(s, "configureGreyMan", { enabled: true, partySize: 1 });
  const before = structuredClone(s);
  s = cmd(s, "skipActor", { id: s.actors[0].id, occurrence: 0 });
  assert.equal(s.now, 0);
  assert.equal(s.active, null);
  assert.equal(s.actors[0].nextActivation, 12);
  assert.equal(s.grey.count, 0);
  assert.equal(s.grey.pending, false);
  assert.equal(before.actors[0].nextActivation, 0);
  s = cmd(s, "moveActor", { id: s.actors[0].id, zone: 6 });
  assert.equal(s.actors[0].nextActivation, 3);
});
test("skipping a later forecast occurrence preserves earlier turns and follows movement", () => {
  let s = ready("enemy");
  const id = s.actors[0].id;
  s = cmd(s, "skipActor", { id, occurrence: 1 });
  assert.equal(s.actors[0].nextActivation, 0);
  s = cmd(s, "beginNext");
  s = cmd(s, "moveActor", { id, zone: 6 });
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[0].nextActivation, 6);
  s = cmd(s, "moveActor", { id, zone: 0 });
  assert.equal(s.actors[0].nextActivation, 24);
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[0].nextActivation, 36);
});
test("skipping the active actor’s upcoming row preserves its current turn", () => {
  let s = cmd(ready(), "beginNext");
  const active = structuredClone(s.active),
    id = s.actors[0].id;
  s = cmd(s, "skipActor", { id, occurrence: 0 });
  s = cmd(s, "skipActor", { id, occurrence: 0 });
  assert.deepEqual(s.active, active);
  s = cmd(s, "finishTurn");
  assert.equal(s.actors[0].nextActivation, 36);
});
test("skip validates targets and occurrence numbers without mutating the scene", () => {
  const s = ready();
  for (const occurrence of [-1, 1.5, 100, null])
    assert.throws(
      () => cmd(s, "skipActor", { id: s.actors[0].id, occurrence }),
      /occurrence/i,
    );
  assert.throws(
    () => cmd(createEncounter(), "skipActor", { id: "missing", occurrence: 0 }),
    /begin/i,
  );
  assert.equal(s.actors[0].nextActivation, 0);
});

test("Grey Man skips can remove a pending action or a later triggered action", () => {
  let s = cmd(ready(), "configureGreyMan", { enabled: true, partySize: 1 });
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  assert.equal(s.grey.pending, true);
  s = cmd(s, "skipActor", { id: "grey", occurrence: 0 });
  assert.equal(s.grey.pending, false);
  s = cmd(s, "skipActor", { id: "grey", occurrence: 0 });
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  assert.equal(s.grey.pending, false);
  s = cmd(s, "beginNext");
  s = cmd(s, "finishTurn");
  assert.equal(s.grey.pending, true);
});
test("splitting an enemy never copies planned skipped actions", () => {
  let s = ready("enemy");
  s = cmd(s, "skipActor", { id: s.actors[0].id, occurrence: 1 });
  s = cmd(s, "splitActor", { id: s.actors[0].id });
  assert.deepEqual(s.actors[1].skipTurns, []);
});
