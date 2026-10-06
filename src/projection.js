import { applyCommand, nextEvents, hasStranded } from "./encounter.js";
import { delayFor } from "./timing.js";
export function publicRoster(s) {
  return s.actors
    .filter((a) => a.type === "pc" && !a.removed)
    .map((a) => ({ id: a.id, name: a.name }));
}
// Forecasting never changes the live encounter. A full window assumes scheduled
// ritual phases resolve; occupants of projected collapsed zones stop contributing turns.
function projectRitual(s) {
  const next = applyCommand(s, { type: "resolvePhase" });
  for (const a of next.actors)
    if (next.zones.find((z) => z.id === a.zone).collapsed) a.removed = true;
  if (
    next.grey.enabled &&
    next.zones.find((z) => z.id === (next.grey.zone ?? 0)).collapsed
  )
    next.grey.enabled = false;
  return next;
}
export function forecast(
  state,
  { horizon = 48, maxEvents = 100, throughRitual = false } = {},
) {
  const events = [],
    occurrences = new Map();
  let s = structuredClone(state);
  if (s.phase === "setup")
    return { events: nextEvents(s).slice(0, maxEvents), truncated: false };
  if (s.active?.kind === "ritual") {
    if (!throughRitual) return { events: [], truncated: false };
    s = projectRitual(s);
  }
  if (hasStranded(s)) {
    if (!throughRitual) return { events: [], truncated: false };
    for (const a of s.actors)
      if (s.zones.find((z) => z.id === a.zone).collapsed) a.removed = true;
    if (
      s.grey.enabled &&
      s.zones.find((z) => z.id === (s.grey.zone ?? 0)).collapsed
    )
      s.grey.enabled = false;
  }
  if (s.active) s = applyCommand(s, { type: "finishTurn" });
  while (events.length < maxEvents) {
    const e = nextEvents(s)[0];
    if (!e || e.at > state.now + horizon) return { events, truncated: false };
    const occurrence = occurrences.get(e.key) ?? 0;
    occurrences.set(e.key, occurrence + 1);
    events.push({ ...e, occurrence, key: `${e.key}:${occurrence}` });
    if (e.kind === "ritual" && !throughRitual)
      return { events, truncated: false };
    s = applyCommand(s, { type: "beginNext" });
    s =
      e.kind === "ritual"
        ? projectRitual(s)
        : applyCommand(s, { type: "finishTurn" });
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
        ritualPhase: e.ritualPhase ?? null,
        collapseZone: e.collapseZone ?? null,
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
    : forecast(s, { horizon: 12, maxEvents: 2000, throughRitual: true });
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
    events: f.events.map(publicEvent),
    truncated: f.truncated,
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
    ...forecast(s, { throughRitual: true }),
  };
}
