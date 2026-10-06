import {
  el,
  badge,
  panel,
  eventRows,
  empty,
  fmt,
  zoneLabel,
  actorIcon,
} from "./ui.js";
export function renderPlayer(s) {
  const a = s.actor;
  return el(
    "div",
    { class: "player-view" },
    el(
      "div",
      { class: "page-heading" },
      el(
        "div",
        {},
        el("p", { class: "eyebrow" }, "PLAYER VIEW"),
        el("h1", { class: "actor-name" }, actorIcon("pc"), a.name),
      ),
      badge(
        s.waiting ? "PREPARING" : "LIVE ENCOUNTER",
        s.waiting ? "" : "teal",
      ),
    ),
    el(
      "div",
      { class: "player-stats" },
      el(
        "div",
        { class: "stat" },
        el("span", {}, "YOUR ZONE"),
        el("strong", {}, a.placed ? zoneLabel(a.zone) : "—"),
        el(
          "small",
          {},
          a.collapsed
            ? "Collapsed · awaiting DM resolution"
            : a.placed
              ? "Current zone"
              : "Awaiting placement",
        ),
      ),
      el(
        "div",
        { class: "stat" },
        el("span", {}, "TIME RATE"),
        el("strong", {}, a.placed ? `${fmt(a.rate)}×` : "—"),
        el(
          "small",
          {},
          a.placed
            ? a.rate > 1
              ? "Faster than normal"
              : a.rate < 1
                ? "Slower than normal"
                : "Normal time"
            : "Set by your starting zone",
        ),
      ),
      el(
        "div",
        { class: "stat" },
        el("span", {}, "RITUAL"),
        el("strong", {}, `${s.ritual.progress} / 6`),
        el(
          "small",
          {},
          s.ritual.status === "idle" ? "Not yet started" : s.ritual.status,
        ),
      ),
    ),
    s.active
      ? el(
          "section",
          { class: "now-card" },
          el("span", { class: "eyebrow" }, "CURRENT EVENT"),
          el(
            "h2",
            { class: "current-name" },
            actorIcon(s.active.actorType ?? s.active.kind),
            s.active.name,
          ),
          el(
            "span",
            {},
            s.active.id === a.id ? "It’s your turn." : "Turn in progress.",
          ),
        )
      : null,
    a.collapsed
      ? el(
          "div",
          { class: "notice danger" },
          "Your zone has collapsed. The DM will resolve your character’s position.",
        )
      : null,
    panel(
      "Coming up",
      s.waiting
        ? empty(
            "Registered",
            a.placed
              ? "Waiting for the DM to begin."
              : "Waiting for starting-zone placement.",
          )
        : s.events.length
          ? eventRows(s.events, { personalId: a.id, showEnemyZones: false })
          : empty(
              "No upcoming events",
              "Waiting for the current event to resolve.",
            ),
    ),
    s.grey
      ? el(
          "div",
          { class: "grey-player" },
          el(
            "span",
            { class: "actor-name" },
            actorIcon("grey", true),
            "The Grey Man",
          ),
          el(
            "strong",
            {},
            s.grey.pending
              ? "Activation queued"
              : `${s.grey.count} / ${s.grey.partySize} player turns`,
          ),
        )
      : null,
  );
}
