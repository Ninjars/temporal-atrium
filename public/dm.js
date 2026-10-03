import {
  el,
  button,
  badge,
  empty,
  field,
  select,
  zoneSelect,
  panel,
  eventRows,
  fmt,
  zoneLabel,
  copyLink,
} from "./ui.js";
export function renderDM(s, { command, notify }) {
  const active = s.active,
    pending = s.actors.filter((a) => !a.placed),
    stranded = s.actors.filter(
      (a) => a.placed && s.zones.find((z) => z.id === a.zone).collapsed,
    );
  const act = (type, payload = {}) => command({ type, ...payload });
  const share = () => copyLink(s.joinUrls[0], notify);
  const heading = el(
    "div",
    { class: "page-heading" },
    el(
      "div",
      {},
      el("p", { class: "eyebrow" }, "ENCOUNTER CONTROL"),
      el("h1", {}, "The Temporal Atrium"),
      el(
        "p",
        { class: "subtitle" },
        "Every position changes the rhythm. You keep the time.",
      ),
    ),
    el(
      "div",
      { class: "heading-actions" },
      badge(
        s.phase === "setup" ? "SETUP" : "LIVE ENCOUNTER",
        s.phase === "setup" ? "" : "teal",
      ),
      button("↗ Invite players", share, "secondary"),
    ),
  );
  const stats = el(
    "div",
    { class: "stats-grid" },
    el(
      "div",
      { class: "stat clock" },
      el("span", {}, "TEMPORAL CLOCK"),
      el("strong", {}, fmt(s.now), el("small", {}, " ticks")),
      el(
        "small",
        {},
        s.phase === "setup"
          ? "Place the cast, then begin"
          : "Advances with the next event",
      ),
    ),
    el(
      "div",
      { class: "stat" },
      el("span", {}, "RITUAL PROGRESS"),
      el("strong", {}, `${s.ritual.progress}`, el("small", {}, " / 6 phases")),
      el(
        "div",
        {
          class: "phase-dots",
          "aria-label": `${s.ritual.progress} of 6 phases`,
        },
        Array.from({ length: 6 }, (_, i) =>
          el("i", { class: i < s.ritual.progress ? "filled" : "" }),
        ),
      ),
    ),
    el(
      "div",
      { class: "stat" },
      el("span", {}, "NEXT RITUAL PHASE"),
      el(
        "strong",
        {},
        s.ritual.next === null ? "—" : fmt(s.ritual.next),
        s.ritual.next !== null ? el("small", {}, " ticks") : null,
      ),
      el(
        "small",
        {},
        s.ritual.status === "idle"
          ? "Waiting for conditions"
          : s.ritual.status === "suspended"
            ? "Interrupted · clock suspended"
            : s.ritual.status === "complete"
              ? "The ritual is complete"
              : `In ${fmt(Math.max(0, s.ritual.next - s.now))} ticks`,
      ),
    ),
  );
  const zones = el(
    "section",
    { class: "zone-panel" },
    el(
      "div",
      { class: "panel-heading" },
      el("h2", {}, "The atrium"),
      el("span", { class: "muted" }, "SLOW ← temporal rate → FAST"),
    ),
    el(
      "div",
      { class: "zone-strip" },
      s.zones.map((z) => {
        const count = s.actors.filter(
          (a) => a.placed && a.zone === z.id,
        ).length;
        const card = el(
          "div",
          {
            class: `zone ${z.id < 0 ? "slow" : z.id > 0 ? "fast" : "normal"} ${z.collapsed ? "collapsed" : ""} ${z.step !== z.id ? "altered" : ""}`,
          },
          el("strong", {}, zoneLabel(z.id)),
          el(
            "span",
            { class: "zone-rate" },
            z.collapsed
              ? "Collapsed"
              : `${fmt(12 / [48, 36, 24, 18, 16, 14, 12, 10, 8, 6, 5, 4, 3][z.step + 6])}×`,
          ),
          el("small", {}, `${count} ${count === 1 ? "actor" : "actors"}`),
          button(
            "↓",
            () => act("slowPillar", { zone: z.id }),
            "pillar",
            z.collapsed || z.step === -6,
          ),
        );
        card.lastChild.setAttribute(
          "aria-label",
          `Slow pillar in zone ${zoneLabel(z.id)}`,
        );
        card.lastChild.title = "Slow this zone one temporal step";
        if (z.step !== z.id && !z.collapsed) {
          const restore = button(
            "Restore",
            () => act("restorePillar", { zone: z.id }),
            "restore",
          );
          restore.setAttribute(
            "aria-label",
            `Restore pillar in zone ${zoneLabel(z.id)}`,
          );
          card.append(restore);
        }
        return card;
      }),
    ),
    el(
      "p",
      { class: "zone-help" },
      "↓ Slow a pillar one step. Waiting turns immediately shift to preserve their progress.",
    ),
  );
  const roster = el(
    "div",
    { class: "roster" },
    s.actors.length
      ? s.actors.map((a) => {
          const card = el(
            "article",
            { class: `actor-card ${a.type}` },
            el(
              "div",
              { class: "actor-title" },
              el(
                "div",
                {},
                el("strong", {}, a.name),
                el(
                  "small",
                  {},
                  a.type === "pc"
                    ? `${a.playerName} · initiative ${a.initiative}`
                    : `${a.type === "enemy" ? "Enemy / group" : "Ally"} · initiative ${a.initiative}`,
                ),
              ),
              badge(
                a.type === "pc" ? "PC" : a.type === "npc" ? "NPC" : "ENEMY",
              ),
            ),
            !a.placed
              ? el(
                  "p",
                  { class: "pending-label" },
                  "Awaiting starting position",
                )
              : null,
          );
          const zone = zoneSelect(`zone-${a.id}`, s.zones, a.zone, (e) => {
            if (a.placed)
              act("moveActor", { id: a.id, zone: Number(e.target.value) });
          });
          zone.setAttribute("aria-label", `Zone for ${a.name}`);
          if (!a.placed) zone.setAttribute("data-draft", "true");
          const row = el("div", { class: "actor-controls" }, zone);
          if (!a.placed)
            row.append(
              button(
                "Place",
                () => act("placeActor", { id: a.id, zone: Number(zone.value) }),
                "primary small",
              ),
            );
          else
            row.append(
              el(
                "small",
                { class: "actor-next" },
                s.phase === "setup"
                  ? `First ${fmt(a.nextActivation)}`
                  : active?.id === a.id
                    ? "Acting now"
                    : a.nextActivation === null
                      ? "—"
                      : `Next ${fmt(a.nextActivation)}`,
              ),
            );
          const remove = button(
            "×",
            () => {
              if (
                confirm(`Remove ${a.name} from the scene? You can undo this.`)
              )
                act("removeActor", { id: a.id });
            },
            "remove",
          );
          remove.setAttribute("aria-label", `Remove ${a.name}`);
          row.append(remove);
          card.append(row);
          return card;
        })
      : empty(
          "The cast is gathering",
          "Players can register from the shared link.",
        ),
  );
  const add = el(
    "details",
    { class: "add-actor" },
    el("summary", {}, "+ Add an actor or group"),
  );
  const form = el(
    "form",
    { id: "add-form" },
    field("Character / group name", "actor-name", "text", "", {
      maxlength: 80,
      "data-draft": "true",
    }),
    el(
      "div",
      { class: "form-pair" },
      el(
        "label",
        { class: "field" },
        el("span", {}, "Type"),
        select(
          "actor-type",
          [
            { value: "enemy", label: "Enemy / group" },
            { value: "npc", label: "NPC / ally" },
            { value: "pc", label: "Player character" },
          ],
          "enemy",
        ),
      ),
      field("Initiative", "actor-initiative", "number", 10, {
        min: -1000,
        max: 1000,
        step: "any",
        "data-draft": "true",
      }),
    ),
    el(
      "label",
      { class: "field" },
      el("span", {}, "Starting zone"),
      zoneSelect("actor-zone", s.zones, 0),
    ),
    el(
      "button",
      { class: "button primary wide", type: "submit", "data-mutate": "true" },
      "Add to scene",
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const success = await act("addActor", {
      name: form.querySelector("#actor-name").value,
      actorType: form.querySelector("#actor-type").value,
      playerName: "DM",
      initiative: Number(form.querySelector("#actor-initiative").value),
      zone: Number(form.querySelector("#actor-zone").value),
    });
    if (success) {
      document.querySelector("#actor-name").value = "";
    }
  });
  add.append(form);
  const rosterPanel = panel(
    "In the scene",
    el("div", {}, roster, add),
    badge(String(s.actors.length)),
  );
  const warning =
    pending.length && s.phase === "setup"
      ? el(
          "div",
          { class: "notice" },
          `${pending.length} ${pending.length === 1 ? "character needs" : "characters need"} a starting zone before the encounter can begin.`,
        )
      : stranded.length
        ? el(
            "div",
            { class: "notice danger" },
            `Collapsed zone: resolve ${stranded.map((a) => a.name).join(", ")} by moving or removing them.`,
          )
        : null;
  const current = el(
    "div",
    { class: "now-card" },
    el(
      "div",
      { class: "now-top" },
      el(
        "span",
        { class: "eyebrow" },
        s.phase === "setup" ? "READY WHEN YOU ARE" : "HAPPENING NOW",
      ),
      active
        ? badge(
            active.kind === "ritual"
              ? "RITUAL"
              : active.kind === "grey"
                ? "OFF-CLOCK"
                : "TURN",
          )
        : null,
    ),
    el(
      "h2",
      {},
      s.phase === "setup"
        ? "Set the scene"
        : active
          ? active.name
          : "Between moments",
    ),
    el(
      "p",
      {},
      s.phase === "setup"
        ? "Starting zones shape the first turn order."
        : active?.kind === "ritual"
          ? `Phase ${s.ritual.progress + 1} is ready. Resolve it to collapse the next outer zones.`
          : active
            ? "Resolve actions at the table, then finish this turn."
            : "Advance when everyone at the table is ready.",
    ),
    s.phase === "setup"
      ? button(
          "Begin encounter →",
          () => act("beginEncounter"),
          "primary wide",
          pending.length > 0 || !s.actors.length,
        )
      : active
        ? button(
            active.kind === "ritual" ? "Resolve phase →" : "Finish turn →",
            () => act(active.kind === "ritual" ? "resolvePhase" : "finishTurn"),
            "primary wide",
          )
        : button(
            "Begin next event →",
            () => act("beginNext"),
            "primary wide",
            !s.hasNext || stranded.length > 0,
          ),
  );
  const timeline = panel(
    s.phase === "setup" ? "Opening sequence" : "Coming up",
    s.events.length
      ? eventRows(s.events, { ticks: true })
      : empty(
          s.phase === "setup"
            ? "A place for every moment"
            : s.hasNext
              ? "Beyond the preview"
              : "No turns scheduled",
          s.phase === "setup"
            ? "Add and place actors to preview the order."
            : s.hasNext
              ? `${s.nextEvent.name} is scheduled at tick ${fmt(s.nextEvent.at)}. Begin next to advance.`
              : "Add an actor or start/resume the ritual.",
        ),
    badge("TICKS"),
  );
  const center = el(
    "section",
    { class: "center-column" },
    warning,
    current,
    timeline,
    el(
      "p",
      { class: "timeline-note" },
      s.truncated
        ? "Preview limited to 100 events."
        : "Projected at current rates. The future stops at the next unresolved ritual phase.",
    ),
  );
  const ritual = panel(
    "Ritual clock",
    el(
      "div",
      { class: "panel-body" },
      el(
        "div",
        { class: "ritual-status" },
        badge(
          s.ritual.status.toUpperCase(),
          s.ritual.status === "running" ? "teal" : "",
        ),
        el("span", { class: "muted" }, `Phase ${s.ritual.progress} of 6`),
      ),
      el(
        "p",
        { class: "muted" },
        s.ritual.status === "suspended"
          ? "Progress is held. Resume when the casters recover."
          : "Control the clock as conditions change at the table.",
      ),
      el(
        "div",
        { class: "control-grid" },
        button(
          "Start",
          () => act("ritualStart"),
          "secondary",
          s.phase !== "running" || s.ritual.status !== "idle",
        ),
        button(
          "Delay +6",
          () => act("ritualDelay"),
          "secondary",
          s.ritual.status !== "running",
        ),
        button(
          "Interrupt",
          () => act("ritualInterrupt"),
          "secondary",
          s.ritual.status !== "running",
        ),
        button(
          "Resume",
          () => act("ritualResume"),
          "secondary",
          s.ritual.status !== "suspended",
        ),
      ),
      el(
        "p",
        { class: "hint" },
        "Start / resume: next phase in 12 ticks. Delay adds 6 to its due time.",
      ),
    ),
  );
  const greyForm = el(
    "form",
    { id: "grey-form" },
    field(
      "PC turns per activation",
      "grey-count",
      "number",
      s.grey.enabled
        ? s.grey.partySize
        : Math.max(1, s.actors.filter((a) => a.type === "pc").length),
      { min: 1, max: 100 },
    ),
    el(
      "button",
      {
        type: "submit",
        class: "button secondary wide",
        "data-mutate": "true",
        disabled: active?.kind === "grey",
      },
      s.grey.enabled ? "Apply & reset counter" : "Bring in the Grey Man",
    ),
  );
  greyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    act("configureGreyMan", {
      enabled: true,
      partySize: Number(greyForm.querySelector("input").value),
    });
  });
  const grey = panel(
    "The Grey Man",
    el(
      "div",
      { class: "panel-body" },
      el(
        "div",
        { class: "grey-meter" },
        el(
          "strong",
          {},
          s.grey.enabled ? `${s.grey.count} / ${s.grey.partySize}` : "◇",
        ),
        badge(
          s.grey.enabled ? (s.grey.pending ? "READY" : "PRESENT") : "ABSENT",
        ),
      ),
      el(
        "p",
        { class: "muted" },
        "He follows player activity, wherever time flows.",
      ),
      greyForm,
      s.grey.enabled
        ? button(
            "Withdraw",
            () =>
              act("configureGreyMan", {
                enabled: false,
                partySize: s.grey.partySize,
              }),
            "subtle wide",
            active?.kind === "grey",
          )
        : null,
    ),
  );
  const history = panel(
    "Recent changes",
    el(
      "ol",
      { class: "history" },
      s.history
        .slice(0, 8)
        .map((h) =>
          el("li", {}, el("span", {}, fmt(h.at)), el("p", {}, h.message)),
        ),
    ),
  );
  const utility = el(
    "div",
    { class: "utilities" },
    button("↶ Undo last change", () => act("undo"), "secondary", !s.canUndo),
    button(
      "Load example",
      () => {
        if (
          confirm(
            "Replace this scene with an example encounter? You can undo this.",
          )
        )
          act("example");
      },
      "subtle",
    ),
    button(
      "Reset scene",
      () => {
        if (
          confirm(
            "Clear this encounter and all registrations? You can undo this.",
          )
        )
          act("reset");
      },
      "subtle",
    ),
  );
  return el(
    "div",
    { class: "dm-view" },
    heading,
    stats,
    zones,
    el(
      "div",
      { class: "workspace" },
      rosterPanel,
      center,
      el("aside", { class: "right-column" }, ritual, grey, history),
    ),
    utility,
  );
}
