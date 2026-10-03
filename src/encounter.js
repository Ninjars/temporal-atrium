import { randomUUID } from "node:crypto";
import { delayFor, reschedule, seedActors, compareEvents } from "./timing.js";

export function createEncounter() {
  return {
    phase: "setup",
    now: 0,
    actors: [],
    zones: Array.from({ length: 13 }, (_, i) => ({
      id: i - 6,
      step: i - 6,
      collapsed: false,
    })),
    active: null,
    ritual: { status: "idle", progress: 0, next: null },
    grey: { enabled: false, partySize: 1, count: 0, pending: false },
    history: [],
    serial: 0,
  };
}
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};
function name(value, label = "Name") {
  requireThat(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= 80,
    `${label} must contain 1–80 characters.`,
  );
  return value.trim();
}
function zoneOf(s, id, allowCollapsed = false) {
  const z = s.zones.find((z) => z.id === id);
  requireThat(
    z && (allowCollapsed || !z.collapsed),
    "Choose a surviving zone.",
  );
  return z;
}
function actorOf(s, id) {
  const a = s.actors.find((a) => a.id === id && !a.removed);
  requireThat(a, "Character is no longer in the scene.");
  return a;
}
const live = (s) => s.actors.filter((a) => !a.removed);
export function nextEvents(s) {
  const events = [];
  if (s.ritual.next !== null)
    events.push({
      kind: "ritual",
      at: s.ritual.next,
      name: "Ritual phase",
      key: "ritual",
    });
  if (s.grey.enabled && s.grey.pending)
    events.push({ kind: "grey", at: s.now, name: "The Grey Man", key: "grey" });
  for (const a of live(s))
    if (
      a.placed &&
      a.nextActivation !== null &&
      !zoneOf(s, a.zone, true).collapsed &&
      !(s.active?.kind === "actor" && s.active.id === a.id)
    )
      events.push({
        kind: "actor",
        id: a.id,
        at: a.nextActivation,
        name: a.name,
        actorType: a.type,
        zone: a.zone,
        initiative: a.initiative,
        order: a.order,
        key: a.id,
      });
  return events.sort(compareEvents);
}
function log(s, message) {
  s.history.unshift({ at: s.now, message });
  s.history = s.history.slice(0, 80);
}
function running(s) {
  requireThat(s.phase === "running", "Begin the encounter first.");
}
function relocate(s, a, zone) {
  const old = zoneOf(s, a.zone, true),
    target = zoneOf(s, zone),
    before = a.nextActivation;
  a.zone = zone;
  if (
    s.phase === "running" &&
    a.placed &&
    before !== null &&
    !(s.active?.kind === "actor" && s.active.id === a.id)
  ) {
    a.nextActivation = reschedule({
      now: s.now,
      next: before,
      oldDelay: delayFor(old.step),
      newDelay: delayFor(target.step),
    });
    if (before !== a.nextActivation)
      log(
        s,
        `${a.name}: ${before.toFixed(2)} → ${a.nextActivation.toFixed(2)}`,
      );
  }
}
export function applyCommand(state, c) {
  requireThat(c && typeof c.type === "string", "Invalid command.");
  const s = structuredClone(state);
  switch (c.type) {
    case "register":
    case "addActor": {
      requireThat(live(s).length < 100, "The scene is limited to 100 actors.");
      requireThat(
        Number.isFinite(c.initiative) && Math.abs(c.initiative) <= 1000,
        "Initiative must be a number between −1000 and 1000.",
      );
      const type = c.type === "register" ? "pc" : c.actorType;
      requireThat(["pc", "npc", "enemy"].includes(type), "Invalid actor type.");
      const placed = c.type === "addActor",
        zone = placed ? zoneOf(s, c.zone).id : 0;
      const a = {
        id: randomUUID(),
        name: name(c.name, "Character name"),
        playerName:
          type === "pc" ? name(c.playerName ?? "DM", "Player name") : "",
        type,
        initiative: c.initiative,
        zone,
        placed,
        removed: false,
        order: s.serial++,
        lastActivation: null,
        nextActivation:
          s.phase === "running" && placed
            ? s.now + delayFor(zoneOf(s, zone).step)
            : null,
      };
      s.actors.push(a);
      log(
        s,
        `${a.name} joined the scene${placed ? "" : " · awaiting placement"}.`,
      );
      break;
    }
    case "placeActor": {
      const a = actorOf(s, c.id);
      requireThat(
        !a.placed || s.phase === "setup",
        "Character has already been placed.",
      );
      a.zone = zoneOf(s, c.zone).id;
      a.placed = true;
      if (s.phase === "running")
        a.nextActivation = s.now + delayFor(zoneOf(s, a.zone).step);
      log(s, `${a.name} placed in zone ${a.zone >= 0 ? "+" : ""}${a.zone}.`);
      break;
    }
    case "moveActor": {
      const a = actorOf(s, c.id);
      requireThat(a.placed, "Confirm starting placement first.");
      relocate(s, a, c.zone);
      log(s, `${a.name} moved to zone ${c.zone >= 0 ? "+" : ""}${c.zone}.`);
      break;
    }
    case "removeActor": {
      const a = actorOf(s, c.id);
      a.removed = true;
      a.nextActivation = null;
      if (s.active?.id === a.id) s.active = null;
      log(s, `${a.name} removed from the scene.`);
      break;
    }
    case "beginEncounter":
      requireThat(s.phase === "setup", "Encounter already started.");
      requireThat(live(s).length > 0, "Add at least one actor.");
      requireThat(
        live(s).every((a) => a.placed),
        "Place every registered character first.",
      );
      s.phase = "running";
      log(s, "Encounter begins.");
      break;
    case "beginNext": {
      running(s);
      requireThat(!s.active, "Finish the current event first.");
      requireThat(
        !live(s).some((a) => a.placed && zoneOf(s, a.zone, true).collapsed),
        "Resolve actors in collapsed zones first.",
      );
      const next = nextEvents(s)[0];
      requireThat(next, "No events scheduled.");
      s.now = Math.max(s.now, next.at);
      s.active = { ...next, at: s.now };
      log(s, `${next.name} begins.`);
      break;
    }
    case "finishTurn": {
      running(s);
      requireThat(
        s.active && s.active.kind !== "ritual",
        "No actor turn to finish.",
      );
      if (s.active.kind === "grey") s.grey.pending = false;
      else {
        const a = actorOf(s, s.active.id);
        a.lastActivation = s.now;
        a.nextActivation = s.now + delayFor(zoneOf(s, a.zone).step);
        if (a.type === "pc" && s.grey.enabled) {
          s.grey.count++;
          if (s.grey.count >= s.grey.partySize) {
            s.grey.pending = true;
            s.grey.count = 0;
          }
        }
      }
      log(s, `${s.active.name} finished.`);
      s.active = null;
      break;
    }
    case "slowPillar":
    case "restorePillar": {
      const z = zoneOf(s, c.zone),
        before = z.step,
        after = c.type === "slowPillar" ? Math.max(-6, before - 1) : z.id;
      z.step = after;
      for (const a of live(s))
        if (
          a.zone === z.id &&
          a.placed &&
          a.nextActivation !== null &&
          s.phase === "running" &&
          !(s.active?.kind === "actor" && s.active.id === a.id)
        ) {
          const old = a.nextActivation;
          a.nextActivation = reschedule({
            now: s.now,
            next: old,
            oldDelay: delayFor(before),
            newDelay: delayFor(after),
          });
          if (old !== a.nextActivation)
            log(
              s,
              `${a.name}: ${old.toFixed(2)} → ${a.nextActivation.toFixed(2)}`,
            );
        }
      log(
        s,
        `Pillar ${z.id >= 0 ? "+" : ""}${z.id}: ${(12 / delayFor(before)).toFixed(2)}× → ${(12 / delayFor(after)).toFixed(2)}×.`,
      );
      break;
    }
    case "ritualStart":
    case "ritualResume":
      running(s);
      requireThat(
        s.ritual.status === (c.type === "ritualStart" ? "idle" : "suspended"),
        "Ritual cannot start or resume in its current state.",
      );
      s.ritual.status = "running";
      s.ritual.next = s.now + 12;
      log(
        s,
        `Ritual ${c.type === "ritualStart" ? "started" : "resumed"} · next phase at ${s.ritual.next}.`,
      );
      break;
    case "ritualDelay":
    case "ritualInterrupt":
      running(s);
      requireThat(s.ritual.status === "running", "Ritual is not running.");
      if (s.active?.kind === "ritual") s.active = null;
      if (c.type === "ritualDelay") {
        s.ritual.next += 6;
        log(s, `Ritual delayed +6 · next phase at ${s.ritual.next}.`);
      } else {
        s.ritual.status = "suspended";
        s.ritual.next = null;
        log(s, "Ritual interrupted.");
      }
      break;
    case "resolvePhase": {
      requireThat(s.active?.kind === "ritual", "No ritual phase to resolve.");
      const edge = 6 - s.ritual.progress;
      s.zones
        .filter((z) => Math.abs(z.id) === edge)
        .forEach((z) => (z.collapsed = true));
      s.ritual.progress++;
      s.ritual.status = s.ritual.progress === 6 ? "complete" : "running";
      s.ritual.next = s.ritual.progress === 6 ? null : s.now + 12;
      s.active = null;
      log(
        s,
        `Ritual phase ${s.ritual.progress} resolved · zones ±${edge} collapsed.`,
      );
      break;
    }
    case "configureGreyMan":
      requireThat(s.active?.kind !== "grey", "Finish the Grey Man turn first.");
      requireThat(
        typeof c.enabled === "boolean" &&
          Number.isInteger(c.partySize) &&
          c.partySize >= 1 &&
          c.partySize <= 100,
        "Party size must be a whole number from 1 to 100.",
      );
      s.grey = {
        enabled: c.enabled,
        partySize: c.partySize,
        count: 0,
        pending: false,
      };
      log(
        s,
        c.enabled
          ? `Grey Man enabled · every ${c.partySize} PC turns.`
          : "Grey Man withdrawn.",
      );
      break;
    default:
      throw new Error("Unknown command.");
  }
  // Before the clock starts, every roster/placement change updates the initial preview.
  if (state.phase === "setup") {
    const seeded = seedActors(
      live(s).filter((a) => a.placed),
      s.zones,
    );
    for (const a of seeded)
      s.actors[s.actors.findIndex((x) => x.id === a.id)] = a;
  }
  return s;
}
