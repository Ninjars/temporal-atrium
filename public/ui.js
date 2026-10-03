export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on"))
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "value") node.value = value;
    else if (key === "disabled" || key === "hidden" || key === "required")
      node[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity))
    if (child !== null && child !== undefined && child !== false)
      node.append(
        child instanceof Node ? child : document.createTextNode(String(child)),
      );
  return node;
}
export const fmt = (n) => Number(n.toFixed(2)).toString();
export const zoneLabel = (n) => (n > 0 ? `+${n}` : String(n));
export const button = (label, onClick, kind = "", disabled = false) =>
  el(
    "button",
    {
      type: "button",
      class: `button ${kind}`,
      onClick,
      disabled,
      "data-mutate": "true",
    },
    label,
  );
export const badge = (text, kind = "") =>
  el("span", { class: `badge ${kind}` }, text);
export const empty = (title, detail) =>
  el(
    "div",
    { class: "empty" },
    el("div", { class: "empty-symbol" }, "◷"),
    el("h3", {}, title),
    el("p", {}, detail),
  );
export function field(label, id, type = "text", value = "", attrs = {}) {
  return el(
    "label",
    { class: "field", for: id },
    el("span", {}, label),
    el("input", { id, name: id, type, value, required: true, ...attrs }),
  );
}
export function select(id, options, value, onChange) {
  const node = el(
    "select",
    { id, onChange },
    options.map((o) =>
      el("option", { value: o.value, disabled: o.disabled }, o.label),
    ),
  );
  node.value = String(value);
  return node;
}
export function zoneSelect(id, zones, value, onChange) {
  return select(
    id,
    zones
      .filter((z) => !z.collapsed)
      .map((z) => ({ value: z.id, label: `Zone ${zoneLabel(z.id)}` })),
    value,
    onChange,
  );
}
export function panel(title, content, action = null) {
  return el(
    "section",
    { class: "panel" },
    el("div", { class: "panel-heading" }, el("h2", {}, title), action),
    content,
  );
}
export function actorIcon(type, compact = false) {
  const labels = {
    pc: "Player",
    npc: "NPC",
    enemy: "Enemy",
    grey: "Grey Man",
    ritual: "Ritual",
  };
  const symbols = { pc: "◆", npc: "●", enemy: "▲", grey: "✦", ritual: "✧" };
  return el(
    "span",
    {
      class: `actor-icon ${type} ${compact ? "compact" : ""}`,
      role: "img",
      "aria-label": labels[type] ?? "Actor",
    },
    symbols[type] ?? "●",
  );
}
export function eventRows(events, { ticks = false, personalId = null } = {}) {
  return el(
    "ol",
    { class: "timeline" },
    events.map((e, i) =>
      el(
        "li",
        {
          class: `event-row ${e.kind} ${e.actorType ?? ""} ${e.id === personalId ? "personal" : ""}`,
          "data-event-key": e.key ?? `${e.id}:${i}`,
        },
        el(
          "div",
          { class: "event-index" },
          ticks ? fmt(e.at) : String(i + 1).padStart(2, "0"),
        ),
        actorIcon(e.actorType ?? e.kind),
        el(
          "div",
          { class: "event-body" },
          el("strong", {}, e.name),
          e.kind === "grey"
            ? null
            : el(
                "span",
                {},
                e.kind === "ritual"
                  ? `Phase ${e.ritualPhase}/6: zones −${e.collapseZone} and +${e.collapseZone} will collapse`
                  : `${e.actorType === "pc" ? "Player" : e.actorType === "npc" ? "NPC" : "Enemy"} · zone ${zoneLabel(e.zone)}`,
              ),
        ),
        e.id === personalId ? badge("YOU", "blue") : null,
      ),
    ),
  );
}
export async function copyLink(url, notify) {
  try {
    await navigator.clipboard.writeText(url);
    notify("Link copied.");
  } catch {
    window.prompt("Copy this link:", url);
  }
}
