const DELAYS = [48, 36, 24, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3];
export function delayFor(step) {
  if (!Number.isInteger(step) || step < -6 || step > 6)
    throw new Error("Invalid rate step.");
  return DELAYS[step + 6];
}
export function reschedule({ now, next, oldDelay, newDelay }) {
  if (
    ![now, next, oldDelay, newDelay].every(Number.isFinite) ||
    oldDelay <= 0 ||
    newDelay <= 0
  )
    throw new Error("Invalid temporal interval.");
  if (oldDelay === newDelay) return next;
  const remaining = Math.max(0, Math.min(1, (next - now) / oldDelay));
  return now + Math.max(0.01, remaining * newDelay);
}
export function seedActors(actors, zones) {
  const sorted = [...actors].sort(
    (a, b) => b.initiative - a.initiative || a.order - b.order,
  );
  return sorted.map((a, index) => ({
    ...a,
    nextActivation:
      (index / sorted.length) *
      delayFor(zones.find((z) => z.id === a.zone).step),
  }));
}
export function compareEvents(a, b) {
  const priority = { ritual: 0, grey: 1, actor: 2 };
  return (
    a.at - b.at ||
    priority[a.kind] - priority[b.kind] ||
    (b.splitPriority ?? 0) - (a.splitPriority ?? 0) ||
    (b.initiative ?? 0) - (a.initiative ?? 0) ||
    (a.order ?? 0) - (b.order ?? 0)
  );
}
