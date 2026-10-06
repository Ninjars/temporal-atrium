// Optional real-browser acceptance check. npm install --no-save playwright, then:
// node test/browser.e2e.mjs [absolute path to playwright/index.mjs]
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "../src/server.js";
const { chromium } = await import(process.argv[2] || "playwright");
const app = createServer({
  port: 0,
  host: "127.0.0.1",
  dmToken: "browser-check-key",
});
await app.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = `http://127.0.0.1:${app.address().port}`;
const errors = [];
async function page() {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const p = await c.newPage();
  await p.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.__testSocket = this;
      }
    };
  });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept());
  return p;
}
async function click(p, name) {
  await p.getByRole("button", { name, exact: true }).click();
  if (await p.locator(".dm-view").count())
    await p.waitForFunction(() =>
      Boolean(document.querySelector("#app button:not(:disabled)")),
    );
}
async function visible(p, text) {
  await p.getByText(text, { exact: true }).first().waitFor();
}
try {
  const dm = await page(),
    player = await page(),
    rejoin = await page();
  await dm.goto(base);
  assert.equal(
    await dm
      .getByRole("button", { name: "Switch role", exact: true })
      .isVisible(),
    false,
    "Role switch should be hidden on chooser",
  );
  await click(dm, "Dungeon Master Manage encounter ↗");
  await dm.getByLabel("DM key").fill("browser-check-key");
  await click(dm, "Open encounter controls →");
  await visible(dm, "The Temporal Atrium");
  await player.goto(base);
  await click(player, "Player View turn order ↗");
  await player.getByLabel("Player name", { exact: true }).fill("Sam");
  await player.getByLabel("Character name", { exact: true }).fill("Mira");
  await player.getByLabel("Initiative roll").fill("22");
  await click(player, "Join the encounter →");
  await visible(player, "Registered");
  await visible(dm, "Mira");
  await dm.getByLabel("Zone for Mira").selectOption("6");
  await rejoin.goto(base);
  await click(rejoin, "Player View turn order ↗");
  await rejoin.getByLabel("Player name", { exact: true }).fill("Alex");
  await rejoin.getByLabel("Character name", { exact: true }).fill("Torren");
  await rejoin.getByLabel("Initiative roll").fill("12");
  await click(rejoin, "Join the encounter →");
  await visible(dm, "Torren");
  assert.deepEqual(
    {
      partySize: await dm.getByLabel("PC turns per activation").inputValue(),
      pendingZone: await dm.getByLabel("Zone for Mira").inputValue(),
    },
    { partySize: "2", pendingZone: "6" },
    "live roster updates should update untouched defaults and preserve pending placement drafts",
  );
  await click(dm, "Remove Torren");
  await dm
    .getByRole("button", { name: "Move Mira", exact: true })
    .dragTo(dm.locator('[data-zone="6"]'));
  await dm.waitForFunction(() =>
    document
      .querySelector('.zone[data-zone="6"] .zone-actor')
      ?.textContent.includes("Mira"),
  );
  assert.equal(await dm.getByLabel("Zone for Mira").inputValue(), "6");
  await click(dm, "Begin encounter →");
  await visible(player, "LIVE ENCOUNTER");
  await rejoin.goto(base);
  await click(rejoin, "Player Mira →");
  await visible(rejoin, "Mira");
  await click(dm, "Start");
  await visible(dm, "RUNNING");
  await click(dm, "Delay +6");
  await visible(dm, "In 18 ticks");
  await click(dm, "Interrupt");
  await visible(dm, "SUSPENDED");
  await click(dm, "Resume");
  await visible(dm, "In 12 ticks");
  await dm.getByLabel("PC turns per activation").fill("1");
  await click(dm, "Enable Grey Man");
  await click(dm, "Begin next event →");
  await visible(player, "It’s your turn.");
  await click(dm, "Finish & next →");
  await visible(dm, "OFF-CLOCK");
  await click(dm, "Finish & pause");
  assert.ok(
    (await player.locator(".event-row.pc").count()) > 1,
    "Player forecast should include repeated turns across 12 ticks",
  );

  await dm
    .getByRole("button", { name: "Move Mira", exact: true })
    .dragTo(dm.locator('[data-zone="0"]'));
  await dm.waitForFunction(() =>
    document
      .querySelector('.zone[data-zone="0"] .zone-actor.pc')
      ?.textContent.includes("Mira"),
  );
  assert.equal(await dm.getByLabel("Zone for Mira").inputValue(), "0");
  await dm
    .getByRole("button", { name: "Move The Grey Man", exact: true })
    .dragTo(dm.locator('[data-zone="1"]'));
  await dm.waitForFunction(
    () => document.querySelector("#grey-zone")?.value === "1",
  );
  assert.equal(await player.locator(".timeline-note").count(), 0);
  assert.equal(
    await player.getByText("Triggered by PC turns", { exact: true }).count(),
    0,
  );
  await visible(player, "Phase 1/6: zones −6 and +6 will collapse");
  await click(dm, "Slow pillar in zone 0");
  // Move through a few turns and Grey Man activations until the first ritual phase.
  for (let i = 0; i < 18; i++) {
    if (
      await dm
        .getByRole("button", { name: "Resolve phase →", exact: true })
        .count()
    )
      break;
    if (
      await dm
        .getByRole("button", { name: "Finish & next →", exact: true })
        .count()
    )
      await click(dm, "Finish & next →");
    else await click(dm, "Begin next event →");
  }
  await click(dm, "Resolve phase →");
  await visible(dm, "Phase 1 of 6");
  await player.reload();
  await visible(player, "Mira");
  await player.evaluate(() => window.__testSocket.close());
  await visible(player, "Reconnecting…");
  await visible(player, "Live connection");
  await visible(player, "Mira");
  await mkdir("/tmp/temporal-atrium-check", { recursive: true });
  await dm.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
  await dm.screenshot({
    path: "/tmp/temporal-atrium-check/dm.png",
    fullPage: true,
  });
  await player.setViewportSize({ width: 390, height: 844 });
  await player.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
  await player.screenshot({
    path: "/tmp/temporal-atrium-check/player-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await player.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Player mobile should not overflow",
  );
  await click(dm, "Remove Mira");
  await visible(player, "Choose a role");
  await visible(rejoin, "Choose a role");
  await click(player, "Player View turn order ↗");
  await player.getByLabel("Player name", { exact: true }).fill("Sam");
  await player
    .getByLabel("Character name", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await player.getByLabel("Initiative roll").fill("10");
  await click(player, "Join the encounter →");
  await visible(dm, "<img src=x onerror=alert(1)>");
  assert.equal(await dm.locator("img").count(), 0);
  await rejoin.reload();
  await visible(rejoin, "Registered characters");
  await rejoin.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
  await rejoin.screenshot({
    path: "/tmp/temporal-atrium-check/chooser.png",
    fullPage: true,
  });
  await dm.setViewportSize({ width: 390, height: 844 });
  await dm.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
  await dm.screenshot({
    path: "/tmp/temporal-atrium-check/dm-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await dm.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "DM mobile should not overflow",
  );
  // A delayed ritual outside the 48-tick preview must remain actionable.
  await click(dm, "Remove <img src=x onerror=alert(1)>");
  for (let i = 0; i < 7; i++) await click(dm, "Delay +6");
  await visible(dm, "Beyond the preview");
  await click(dm, "Begin next event →");
  await click(dm, "Resolve phase →");
  await visible(dm, "Phase 2 of 6");
  // The invitation is derived from the host, and clipboard fallback offers that same URL.
  let invitation = null;
  dm.removeAllListeners("dialog");
  dm.on("dialog", async (d) => {
    invitation = d.defaultValue();
    await d.accept();
  });
  await dm.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () => Promise.reject(new Error("Denied for fallback test")),
      },
      configurable: true,
    });
  });
  await click(dm, "↗ Invite players");
  assert.equal(invitation, base);
  await dm.keyboard.press("Tab");
  assert.notEqual(
    await dm.evaluate(() => document.activeElement.tagName),
    "BODY",
  );
  // The example scene exercises all normal actor-type symbols together.
  await click(dm, "Load example");
  await visible(dm, "Giant spiders");
  for (const type of ["pc", "npc", "enemy"])
    assert.ok(
      (await dm.locator(`.zone-actor.${type} .actor-icon.${type}`).count()) > 0,
    );
  await dm.setViewportSize({ width: 1440, height: 1100 });
  await dm.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
  await dm.screenshot({
    path: "/tmp/temporal-atrium-check/actor-zones.png",
    fullPage: true,
  });
  await click(dm, "Begin encounter →");
  await click(dm, "Delay Torren by 6 ticks");
  const torren = dm.locator(".actor-card").filter({
    has: dm.getByRole("button", {
      name: "Delay Torren by 6 ticks",
      exact: true,
    }),
  });
  await torren.getByText("Next 7.2", { exact: true }).waitFor();
  await click(dm, "Begin next event →");
  await click(dm, "Delay Mira by 6 ticks");
  await visible(dm, "Next turn +6 ticks");
  assert.ok((await dm.locator(".now-card h2").innerText()).endsWith("Mira"));
  await click(dm, "Finish & pause");
  const mira = dm.locator(".actor-card").filter({
    has: dm.getByRole("button", {
      name: "Delay Mira by 6 ticks",
      exact: true,
    }),
  });
  await mira.getByText("Next 10", { exact: true }).waitFor();
  await click(dm, "Split Giant spiders");
  await visible(dm, "Giant spiders 1");
  await dm
    .getByLabel("Zone for Giant spiders 1", { exact: true })
    .selectOption("-3");
  await click(dm, "Begin next event →");
  assert.ok(
    (await dm.locator(".now-card h2").innerText()).endsWith("Giant spiders 1"),
  );
  await click(dm, "Split Giant spiders 1");
  await click(dm, "Finish & next →");
  assert.ok(
    (await dm.locator(".now-card h2").innerText()).endsWith("Giant spiders 2"),
  );
  await click(dm, "Skip Mira at tick 14");
  assert.equal(
    await dm
      .getByRole("button", { name: "Skip Mira at tick 14", exact: true })
      .count(),
    0,
  );
  await dm
    .getByRole("button", { name: "Skip Mira at tick 10", exact: true })
    .waitFor();
  assert.ok(
    (await dm.locator(".now-card h2").innerText()).endsWith("Giant spiders 2"),
  );
  await click(dm, "Skip Mira at tick 10");
  assert.equal(
    await dm
      .getByRole("button", { name: "Skip Mira at tick 10", exact: true })
      .count(),
    0,
  );
  await dm
    .getByRole("button", { name: "Skip Mira at tick 18", exact: true })
    .waitFor();
  await click(dm, "↶ Undo last change");
  await dm
    .getByRole("button", { name: "Skip Mira at tick 10", exact: true })
    .waitFor();
  await dm.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await dm.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: registration, placement, rejoining, ritual controls, Grey Man, movement, pillar changes, collapse, refresh, removal, safe text, desktop/mobile layouts; no browser errors.",
  );
} finally {
  await browser.close();
  await app.close();
}
