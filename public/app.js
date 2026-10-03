import { el, button, badge, field, empty, copyLink, actorIcon } from "./ui.js";
import { renderDM } from "./dm.js";
import { renderPlayer } from "./player.js";
const root = document.querySelector("#app"),
  status = document.querySelector("#connection"),
  leave = document.querySelector("#leave");
const storage = {
  get(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      value === null
        ? sessionStorage.removeItem(key)
        : sessionStorage.setItem(key, value);
    } catch {}
  },
};
const hash = new URLSearchParams(location.hash.slice(1));
let token = hash.get("dm") || storage.get("dm-token") || "",
  actorId = hash.get("player") || storage.get("actor-id"),
  role = actorId ? "player" : "chooser",
  mode = hash.has("dm") ? "dm" : null;
if (hash.has("dm")) {
  storage.set("dm-token", token);
  history.replaceState(null, "", location.pathname);
}
let ws,
  connected = false,
  synced = false,
  revision = 0,
  data = null,
  roster = [],
  busy = false,
  seq = 0,
  noticeTimer;
const pending = new Map();
export function notify(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (toast.hidden = true), 6500);
}
function request(type, payload) {
  if (!connected)
    return Promise.reject(new Error("Connection lost. Reconnecting…"));
  const id = String(++seq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("No response. Check the connection and try again."));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, type, payload, revision }));
  });
}
async function choose(nextRole, id = null) {
  role = nextRole;
  actorId = id;
  synced = false;
  data = null;
  storage.set("actor-id", nextRole === "player" ? id : null);
  try {
    await request("subscribe", { role, actorId, token });
  } catch (error) {
    role = "chooser";
    mode = "dm";
    notify(error.message);
    await request("subscribe", { role: "chooser" }).catch(() => {});
    render();
  }
}
async function command(payload) {
  if (busy || !synced) return false;
  if (["configureGreyMan", "reset", "example", "undo"].includes(payload.type))
    document.querySelector("#grey-count")?.removeAttribute("data-edited");
  busy = true;
  render();
  try {
    await request("command", payload);
    return true;
  } catch (error) {
    notify(error.message);
    return false;
  } finally {
    busy = false;
    render();
  }
}
function connect() {
  ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
  );
  ws.addEventListener("open", () => {
    connected = true;
    request("subscribe", { role, actorId, token }).catch((error) => {
      notify(error.message);
      role = "chooser";
      mode = "dm";
      request("subscribe", { role }).catch(() => {});
    });
    updateStatus();
  });
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.type === "snapshot") {
      revision = m.revision;
      if (m.role !== role) return;
      data = m.data;
      synced = true;
      if (role === "chooser") roster = data.roster;
      if (role === "player" && data.removed) {
        notify(
          "That character is no longer in the scene. Choose a character or register again.",
        );
        choose("chooser");
        return;
      }
      render();
    } else if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.timer);
      m.type === "error" ? p.reject(new Error(m.message)) : p.resolve(m);
    }
  });
  ws.addEventListener("close", () => {
    connected = false;
    synced = false;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Disconnected. Your scene is still on the host."));
    }
    pending.clear();
    render();
    setTimeout(connect, 1500);
  });
  ws.addEventListener("error", () => updateStatus());
}
function updateStatus() {
  status.textContent =
    connected && synced
      ? "Live connection"
      : connected
        ? "Syncing…"
        : "Reconnecting…";
  status.className = `connection ${connected && synced ? "online" : ""}`;
}
function chooser() {
  const intro = el(
    "section",
    { class: "welcome" },
    el("h1", {}, "Temporal Atrium"),
    el("p", { class: "subtitle" }, "Encounter tracker"),
    el(
      "div",
      { class: "welcome-art", "aria-hidden": "true" },
      Array.from({ length: 13 }, (_, i) =>
        el(
          "span",
          { class: `art-pillar pillar-${i}` },
          el("i"),
          el(
            "small",
            {},
            i === 6 ? "0" : i === 0 ? "−6" : i === 12 ? "+6" : "",
          ),
        ),
      ),
    ),
    el(
      "div",
      { class: "art-caption" },
      el("span", {}, "SLOWED TIME"),
      el("span", {}, "ACCELERATED TIME"),
    ),
  );
  const choices = el(
    "div",
    { class: "role-options" },
    button(
      el(
        "span",
        {},
        el("strong", {}, "Dungeon Master"),
        el("small", {}, "Manage encounter"),
        el("b", {}, "↗"),
      ),
      () => {
        mode = "dm";
        render();
      },
      `role-card ${mode === "dm" ? "selected" : ""}`,
    ),
    button(
      el(
        "span",
        {},
        el("strong", {}, "Player"),
        el("small", {}, "View turn order"),
        el("b", {}, "↗"),
      ),
      () => {
        mode = "player";
        render();
      },
      `role-card ${mode === "player" ? "selected" : ""}`,
    ),
  );
  let form = null;
  if (mode === "dm") {
    form = el(
      "form",
      { id: "dm-login", class: "join-form" },
      field("DM key", "dm-key", "password", token, {
        autocomplete: "off",
        "data-draft": "true",
      }),
      el(
        "p",
        { class: "hint" },
        "Your key appears in the terminal on the host computer.",
      ),
      el(
        "button",
        { class: "button primary wide", type: "submit", "data-mutate": "true" },
        "Open encounter controls →",
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      token = form.querySelector("input").value.trim();
      storage.set("dm-token", token);
      choose("dm");
    });
  } else if (mode === "player") {
    form = el(
      "form",
      { id: "join-form", class: "join-form" },
      el(
        "div",
        { class: "form-pair" },
        field("Player name", "player-name", "text", "", {
          maxlength: 80,
          autocomplete: "given-name",
          "data-draft": "true",
        }),
        field("Character name", "character-name", "text", "", {
          maxlength: 80,
          "data-draft": "true",
        }),
      ),
      field("Initiative roll", "initiative", "number", "", {
        min: -1000,
        max: 1000,
        step: "any",
        placeholder: "Your rolled total",
        "data-draft": "true",
      }),
      el(
        "button",
        { class: "button primary wide", type: "submit", "data-mutate": "true" },
        "Join the encounter →",
      ),
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const payload = {
        name: form.querySelector("#character-name").value,
        playerName: form.querySelector("#player-name").value,
        initiative: Number(form.querySelector("#initiative").value),
      };
      const signature = JSON.stringify(payload);
      let key = storage.get("registration-key");
      if (!key || storage.get("registration-data") !== signature) {
        key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
        storage.set("registration-key", key);
        storage.set("registration-data", signature);
      }
      busy = true;
      render();
      try {
        const result = await request("register", { ...payload, key });
        storage.set("registration-key", null);
        await choose("player", result.actorId);
      } catch (error) {
        notify(error.message);
      } finally {
        busy = false;
        render();
      }
    });
  }
  const characters = el(
    "section",
    { class: "rejoin" },
    el(
      "div",
      { class: "panel-heading" },
      el("h2", {}, "Registered characters"),
      badge(String(roster.length)),
    ),
    el("p", { class: "muted" }, "Select your character to rejoin."),
    roster.length
      ? el(
          "div",
          { class: "character-list" },
          roster.map((a) =>
            button(
              el(
                "span",
                {},
                actorIcon("pc", true),
                el("strong", {}, a.name),
                el("span", { class: "rejoin-arrow" }, "→"),
              ),
              () => choose("player", a.id),
              "character-link",
            ),
          ),
        )
      : el("p", { class: "no-players" }, "No characters registered."),
  );
  return el(
    "div",
    { class: "chooser" },
    intro,
    el(
      "section",
      { class: "join-panel" },
      el("p", { class: "eyebrow" }, "LOCAL SESSION"),
      el("h2", { class: "join-heading" }, "Choose a role"),
      choices,
      form,
      characters,
    ),
  );
}
function render() {
  const focused = document.activeElement;
  const drafts = new Map(
    [
      ...root.querySelectorAll("[data-draft], #add-form select, [data-edited]"),
    ].map((n) => [
      n.id,
      { value: n.value, edited: n.hasAttribute("data-edited") },
    ]),
  );
  const opened = [...root.querySelectorAll("details[open]")].map(
    (n) => n.className,
  );
  const focusId = focused?.id,
    selection = focused?.selectionStart;
  const oldPositions = new Map(
    [...root.querySelectorAll("[data-event-key]")].map((n) => [
      n.dataset.eventKey,
      n.getBoundingClientRect().top,
    ]),
  );
  const view =
    role === "dm" && data
      ? renderDM(data, { command, notify })
      : role === "player" && data
        ? renderPlayer(data)
        : role === "chooser"
          ? chooser()
          : empty("Connecting", "Waiting for the server.");
  root.replaceChildren(view);
  for (const [id, draft] of drafts) {
    const n = document.getElementById(id);
    if (
      n &&
      (n.tagName !== "SELECT" ||
        [...n.options].some((o) => o.value === draft.value))
    ) {
      n.value = draft.value;
      if (draft.edited) n.setAttribute("data-edited", "true");
    }
  }
  for (const n of root.querySelectorAll("details"))
    if (opened.includes(n.className)) n.open = true;
  if (focusId) {
    const n = document.getElementById(focusId);
    if (n) {
      n.focus({ preventScroll: true });
      if (
        typeof selection === "number" &&
        ["text", "password"].includes(n.type)
      )
        n.setSelectionRange(selection, selection);
    }
  }
  if (!connected || !synced || busy)
    for (const n of root.querySelectorAll("button,input,select"))
      n.disabled = true;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    for (const n of root.querySelectorAll("[data-event-key]")) {
      const prev = oldPositions.get(n.dataset.eventKey),
        top = n.getBoundingClientRect().top;
      if (prev !== undefined && prev !== top)
        n.animate(
          [
            { transform: `translateY(${prev - top}px)`, background: "#e4f2ec" },
            { transform: "translateY(0)", background: "transparent" },
          ],
          { duration: 350, easing: "ease-out" },
        );
      else if (prev === undefined && oldPositions.size)
        n.animate(
          [
            { opacity: 0.3, background: "#e4f2ec" },
            { opacity: 1, background: "transparent" },
          ],
          { duration: 450 },
        );
    }
  leave.hidden = role === "chooser";
  updateStatus();
}
root.addEventListener("input", (event) => {
  if (event.target.id === "grey-count")
    event.target.setAttribute("data-edited", "true");
});
leave.addEventListener("click", () => {
  mode = null;
  choose("chooser");
});
render();
connect();
