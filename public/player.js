import { el, badge, panel, eventRows, empty, fmt, zoneLabel } from "./ui.js";
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
        el("p", { class: "eyebrow" }, "YOUR PLACE IN TIME"),
        el("h1", {}, a.name),
        el(
          "p",
          { class: "subtitle" },
          s.waiting
            ? "The DM is preparing the encounter."
            : "Watch the order shift as time bends around you.",
        ),
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
              ? "Temporal position"
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
          el("span", { class: "eyebrow" }, "HAPPENING NOW"),
          el("h2", {}, s.active.name),
          el(
            "span",
            {},
            s.active.id === a.id
              ? "It’s your turn."
              : "Follow the action at the table.",
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
            "You’re in the scene",
            a.placed
              ? "Your starting position is set. Waiting for the DM to begin."
              : "Your DM will place you in a starting zone.",
          )
        : s.events.length
          ? eventRows(s.events, { personalId: a.id })
          : empty(
              "The future is unwritten",
              "Waiting for the current event to resolve.",
            ),
    ),
    el(
      "p",
      { class: "timeline-note" },
      "Your view ends at your next turn, the next ritual phase, or the near-future horizon. The order may change.",
    ),
    s.grey
      ? el(
          "div",
          { class: "grey-player" },
          el("span", {}, "◇ The Grey Man"),
          el(
            "strong",
            {},
            s.grey.pending
              ? "An activation is waiting"
              : `${s.grey.count} / ${s.grey.partySize} player turns`,
          ),
        )
      : null,
  );
}
