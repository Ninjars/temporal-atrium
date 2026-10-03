import { applyCommand, nextEvents } from "./encounter.js";
import { delayFor } from "./timing.js";
export function publicRoster(s) {
  return s.actors
    .filter((a) => a.type === "pc" && !a.removed)
    .map((a) => ({ id: a.id, name: a.name }));
}
export function forecast(state, { horizon = 48, maxEvents = 100 } = {}) {
  const events = [],
    occurrences = new Map();
  let s = structuredClone(state);
  if (s.phase === "setup")
    return { events: nextEvents(s).slice(0, maxEvents), truncated: false };
  if (s.active?.kind === "ritual") return { events: [], truncated: false };
  if (
    s.actors.some(
      (a) =>
        !a.removed &&
        a.placed &&
        s.zones.find((z) => z.id === a.zone).collapsed,
    )
  )
    return { events: [], truncated: false };
  if (s.active) s = applyCommand(s, { type: "finishTurn" });
  while (events.length < maxEvents) {
    const e = nextEvents(s)[0];
    if (!e || e.at > state.now + horizon) return { events, truncated: false };
    const occurrence = occurrences.get(e.key) ?? 0;
    occurrences.set(e.key, occurrence + 1);
    events.push({ ...e, key: `${e.key}:${occurrence}` });
    if (e.kind === "ritual") return { events, truncated: false };
    s = applyCommand(s, { type: "beginNext" });
    s = applyCommand(s, { type: "finishTurn" });
  }
  return { events, truncated: true };
}
function publicEvent(e) {
  return e
    ? {
        kind: e.kind,
        id: e.id ?? null,
        name: e.name,
        actorType: e.actorType ?? null,
        zone: e.zone ?? null,
        key: e.key,
      }
    : null;
}
export function playerView(s, id) {
  const a = s.actors.find((a) => a.id === id && !a.removed && a.type === "pc");
  if (!a) return { removed: true, roster: publicRoster(s) };
  const zone = s.zones.find((z) => z.id === a.zone),
    waiting = !a.placed || s.phase === "setup";
  const f = waiting
    ? { events: [], truncated: false }
    : forecast(s, { horizon: 12, maxEvents: 100 });
  const personal = f.events.findIndex((e) => e.kind === "actor" && e.id === id);
  const events = personal < 0 ? f.events : f.events.slice(0, personal + 1);
  return {
    removed: false,
    waiting,
    phase: s.phase,
    actor: {
      id: a.id,
      name: a.name,
      zone: a.zone,
      placed: a.placed,
      rate: 12 / delayFor(zone.step),
      collapsed: zone.collapsed,
    },
    active: publicEvent(s.active),
    events: events.map(publicEvent),
    truncated: personal < 0 && f.truncated,
    ritual: { status: s.ritual.status, progress: s.ritual.progress },
    grey: s.grey.enabled
      ? {
          enabled: true,
          count: s.grey.count,
          partySize: s.grey.partySize,
          pending: s.grey.pending,
        }
      : null,
  };
}
export function dmView(s) {
  const nextEvent = nextEvents(s)[0] ?? null;
  return {
    ...structuredClone(s),
    actors: s.actors.filter((a) => !a.removed),
    hasNext: nextEvent !== null,
    nextEvent,
    ...forecast(s),
  };
}
