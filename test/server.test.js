import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";
import { createEncounter, applyCommand } from "../src/encounter.js";
import { createServer } from "../src/server.js";
async function fixture(t) {
  const app = createServer({
    port: 0,
    host: "127.0.0.1",
    dmToken: "test-host-token",
  });
  await app.listen();
  t.after(() => app.close());
  return app;
}
async function client(t, app) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.address().port}/live`);
  const messages = [];
  let seq = 0;
  ws.on("message", (data) => messages.push(JSON.parse(data)));
  await once(ws, "open");
  t.after(() => ws.close());
  return {
    ws,
    messages,
    async send(type, payload = {}, revision) {
      const id = String(++seq);
      ws.send(JSON.stringify({ id, type, payload, revision }));
      return this.wait((m) => m.id === id);
    },
    async wait(predicate) {
      for (let i = 0; i < 100; i++) {
        const m = messages.find(predicate);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("Message timeout");
    },
  };
}
test("registration retries are idempotent and chooser reveals only PC names/IDs", async (t) => {
  const app = await fixture(t),
    c = await client(t, app);
  const a = await c.send("register", {
    key: "same-request-123",
    name: "Mira",
    playerName: "Private Sam",
    initiative: 20,
  });
  assert.equal(a.type, "ack");
  const b = await c.send("register", {
    key: "same-request-123",
    name: "Mira",
    playerName: "Private Sam",
    initiative: 20,
  });
  assert.equal(a.actorId, b.actorId);
  const snap = await c.wait(
    (m) => m.type === "snapshot" && m.data.roster?.length === 1,
  );
  assert.deepEqual(snap.data.roster, [{ id: a.actorId, name: "Mira" }]);
  assert.equal(JSON.stringify(snap).includes("Private Sam"), false);
});
test("DM placement broadcasts, player mutations reject and stale revisions reject after undo", async (t) => {
  const app = await fixture(t),
    p = await client(t, app),
    dm = await client(t, app);
  const reg = await p.send("register", {
    key: "register-1",
    name: "Mira",
    playerName: "Sam",
    initiative: 20,
  });
  await p.send("subscribe", { role: "player", actorId: reg.actorId });
  assert.equal(
    (await p.send("command", { type: "beginEncounter" }, 1)).type,
    "error",
  );
  assert.equal(
    (await dm.send("subscribe", { role: "dm", token: "wrong" })).type,
    "error",
  );
  await dm.send("subscribe", { role: "dm", token: "test-host-token" });
  let result = await dm.send(
    "command",
    { type: "placeActor", id: reg.actorId, zone: 6 },
    1,
  );
  assert.equal(result.revision, 2);
  await p.wait((m) => m.type === "snapshot" && m.data.actor?.placed === true);
  result = await dm.send("command", { type: "undo" }, 2);
  assert.equal(result.revision, 3);
  assert.equal(
    (await dm.send("command", { type: "beginEncounter" }, 2)).type,
    "error",
  );
  assert.equal(
    (await dm.send("command", { type: "removeActor", id: reg.actorId }, 3))
      .type,
    "ack",
  );
  await p.wait((m) => m.type === "snapshot" && m.data.removed === true);
});
test("malformed requests, invalid input and missing character subscriptions are handled", async (t) => {
  const app = await fixture(t),
    c = await client(t, app);
  c.ws.send("{");
  await c.wait((m) => m.type === "error");
  assert.equal(
    (
      await c.send("register", {
        key: "bad",
        name: "",
        playerName: "Sam",
        initiative: 1,
      })
    ).type,
    "error",
  );
  assert.equal(
    (
      await c.send("register", {
        key: "bad",
        name: "A".repeat(81),
        playerName: "Sam",
        initiative: 1,
      })
    ).type,
    "error",
  );
  assert.equal(
    (
      await c.send("register", {
        key: "bad",
        name: "Mira",
        playerName: "Sam",
        initiative: "20",
      })
    ).type,
    "error",
  );
  await c.send("subscribe", { role: "player", actorId: "missing" });
  await c.wait((m) => m.data?.removed === true);
  const again = await client(t, app);
  await again.send("subscribe", { role: "chooser" });
  await again.wait((m) => m.data?.roster?.length === 0);
});
test("websocket rejects foreign origins and oversized messages", async (t) => {
  const app = await fixture(t);
  const bad = new WebSocket(`ws://127.0.0.1:${app.address().port}/live`, {
    origin: "https://unrelated.example",
  });
  const [error] = await once(bad, "error");
  assert.match(error.message, /403/);
  const c = await client(t, app);
  c.ws.send("x".repeat(17000));
  const [code] = await once(c.ws, "close");
  assert.equal(code, 1009);
});
test("reset invalidates retry mappings and static routing rejects unknown paths", async (t) => {
  const app = await fixture(t),
    c = await client(t, app);
  const payload = {
    key: "reset-key",
    name: "Mira",
    playerName: "Sam",
    initiative: 1,
  };
  const a = await c.send("register", payload);
  await c.send("subscribe", { role: "dm", token: "test-host-token" });
  await c.send("command", { type: "reset" }, 1);
  const b = await c.send("register", payload);
  assert.notEqual(a.actorId, b.actorId);
  const response = await fetch(
    `http://127.0.0.1:${app.address().port}/not-a-file`,
  );
  assert.equal(response.status, 404);
});
test("serves the app shell and browser modules with safe content types", async (t) => {
  const app = await fixture(t);
  for (const [path, type] of [
    ["/", "text/html"],
    ["/app.js", "text/javascript"],
    ["/styles.css", "text/css"],
    ["/dm.js", "text/javascript"],
    ["/player.js", "text/javascript"],
  ]) {
    const res = await fetch(`http://127.0.0.1:${app.address().port}${path}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), type);
  }
});
test("DM snapshot supplies player join URLs independent of localhost browser URL", async (t) => {
  const app = await fixture(t),
    c = await client(t, app);
  await c.send("subscribe", { role: "dm", token: "test-host-token" });
  const m = await c.wait((m) => m.role === "dm");
  assert.ok(Array.isArray(m.data.joinUrls));
  assert.ok(m.data.joinUrls.length > 0);
  assert.ok(m.data.joinUrls.every((url) => !url.includes("localhost")));
});

test("server can preserve a running scene and undo finish-and-next as one change", async (t) => {
  let state = applyCommand(createEncounter(), {
    type: "addActor",
    name: "Mira",
    actorType: "pc",
    playerName: "Sam",
    initiative: 20,
    zone: 0,
  });
  state = applyCommand(state, { type: "beginEncounter" });
  state = applyCommand(state, { type: "beginNext" });
  const app = createServer({
    port: 0,
    host: "127.0.0.1",
    dmToken: "test-host-token",
    initialState: state,
  });
  await app.listen();
  t.after(() => app.close());
  const c = await client(t, app);
  await c.send("subscribe", { role: "dm", token: "test-host-token" });
  const initial = await c.wait((m) => m.role === "dm");
  assert.equal(initial.data.active.name, "Mira");
  assert.equal(initial.data.now, 0);
  await c.send("command", { type: "finishAndAdvance" }, 0);
  const next = await c.wait((m) => m.role === "dm" && m.revision === 1);
  assert.equal(next.data.now, 12);
  assert.equal(next.data.active.name, "Mira");
  await c.send("command", { type: "undo" }, 1);
  const undone = await c.wait((m) => m.role === "dm" && m.revision === 2);
  assert.equal(undone.data.now, 0);
  assert.equal(undone.data.active.name, "Mira");
  assert.equal(state.now, 0);
});
