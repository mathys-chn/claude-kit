// Tests du plugin Stream Deck sans Stream Deck : un faux serveur joue le rôle de l'application.
//   node --test streamdeck/test/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const net = require("net");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PLUGIN = path.join(__dirname, "..", "io.github.mathyschn.claudekit.sdPlugin");
const { encodeFrame, decodeFrames } = require(path.join(PLUGIN, "bin", "ws.js"));
const { toLimit, WEEK_MS } = require(path.join(PLUGIN, "bin", "data.js"));
const { renderKey, resolveAction } = require(path.join(PLUGIN, "bin", "render.js"));

// ─── Données d'exemple, comme les écrit la bande kit-band ───
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ck-sd-"));
  const kit = path.join(dir, "claude-kit");
  fs.mkdirSync(path.join(kit, "sessions"), { recursive: true });
  const now = Date.now();
  fs.writeFileSync(path.join(kit, "config.json"), JSON.stringify({ band: { accent: "#059669", accent2: "#6ee7b7" }, general: { currency: "EUR", usdToEur: 0.9 } }));
  fs.writeFileSync(path.join(kit, "limits.json"), JSON.stringify({
    five_hour: { kind: "five_hour", percentUsed: 42, resetsAt: new Date(now + 2 * 3600e3).toISOString(), seenAt: now },
  }));
  const session = (id, project, ageMs, extra = {}) => fs.writeFileSync(path.join(kit, "sessions", `${id}.json`), JSON.stringify({
    sessionId: id, project, model: "Opus 5.5", activity: "idle", cost: 10, elapsedMs: 3600e3, turns: 4,
    context: { tokens: 300000, window: 1000000, percent: 30 }, git: { branch: "main", staged: 1, modified: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0, added: 5, removed: 1 },
    lastTurn: { seconds: 12, tools: 3 }, updatedAt: now - ageMs, ...extra,
  }));
  session("old", "ancien-projet", 60_000);
  session("new", "site-vitrine", 1_000, { context: { tokens: 820000, window: 1000000, percent: 82 } });
  return { dir, kit, session };
}

// ─── Faux serveur Stream Deck ───
function fakeStreamDeck() {
  return new Promise((resolve) => {
    const received = [];
    const waiters = [];
    let client;
    const server = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      let upgraded = false;
      sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (!upgraded) {
          const end = buf.indexOf("\r\n\r\n");
          if (end < 0) return;
          const key = /Sec-WebSocket-Key: (.+)\r\n/i.exec(buf.subarray(0, end).toString())[1].trim();
          const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
          sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
          upgraded = true;
          client = sock;
          buf = buf.subarray(end + 4);
        }
        const { frames, rest } = decodeFrames(buf);
        buf = rest;
        for (const f of frames) {
          if (f.opcode !== 1) continue;
          const msg = JSON.parse(f.payload.toString());
          received.push(msg);
          for (const w of [...waiters]) if (w.match(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({
      port: server.address().port,
      received,
      send: (obj) => client.write(encodeFrame(1, JSON.stringify(obj), false)),
      waitFor: (match, ms = 4000) => new Promise((res, rej) => {
        const found = received.find(match);
        if (found) return res(found);
        const timer = setTimeout(() => rej(new Error("délai dépassé")), ms);
        waiters.push({ match, resolve: (m) => { clearTimeout(timer); res(m); } });
      }),
      close: () => { client && client.destroy(); server.close(); },
    }));
  });
}

const svgOf = (msg) => decodeURIComponent(msg.payload.image.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));

test("trames WebSocket : aller-retour masqué et non masqué, grande taille", () => {
  for (const [text, mask] of [["bonjour", true], ["x".repeat(70_000), false], ["é".repeat(200), true]]) {
    const { frames, rest } = decodeFrames(encodeFrame(1, text, mask));
    assert.strictEqual(rest.length, 0);
    assert.strictEqual(frames[0].payload.toString(), text);
  }
});

test("calcul des limites : rythme, projection et % par jour", () => {
  const now = Date.now();
  // 2 jours écoulés sur 7, 80 % utilisés → vide avant le reset
  const l = toLimit({ percentUsed: 80, resetsAt: new Date(now + 5 * 86400e3).toISOString(), seenAt: now }, WEEK_MS, now);
  assert.ok(Math.abs(l.timePct - 28.57) < 0.1);
  assert.ok(l.pace < -50);
  assert.ok(l.emptyAtMs > now && l.emptyAtMs < now + 5 * 86400e3);
  assert.ok(Math.abs(l.perDay - 4) < 0.01);
});

test("le plugin s'enregistre, dessine les touches et réagit aux réglages et à l'appui", async () => {
  const fx = fixture();
  const sd = await fakeStreamDeck();
  const child = spawn(process.execPath, [path.join(PLUGIN, "bin", "plugin.js"), "-port", String(sd.port), "-pluginUUID", "PLUGIN-1", "-registerEvent", "registerPlugin", "-info", "{}"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: fx.dir },
    stdio: "ignore",
  });
  try {
    const reg = await sd.waitFor((m) => m.event === "registerPlugin");
    assert.strictEqual(reg.uuid, "PLUGIN-1");

    // touche Limite 5 h
    sd.send({ event: "willAppear", action: "io.github.mathyschn.claudekit.limit5h", context: "K1", payload: { settings: {} } });
    const img = svgOf(await sd.waitFor((m) => m.event === "setImage" && m.context === "K1"));
    assert.match(img, />42</);
    assert.match(img, /5 H/);
    assert.match(img, /#059669/, "la couleur vient du thème /kit");
    assert.ok(sd.received.some((m) => m.event === "setTitle" && m.context === "K1" && m.payload.title === ""));

    // touche Limite semaine, identifiant en minuscules comme l'envoie l'app : pas la vue d'ensemble
    sd.send({ event: "willAppear", action: "io.github.mathyschn.claudekit.limitweek", context: "K3", payload: { settings: {} } });
    const week = svgOf(await sd.waitFor((m) => m.event === "setImage" && m.context === "K3"));
    assert.match(week, /SEMAINE/);
    assert.doesNotMatch(week, />ctx</);

    // touche Contexte : prend la session la plus récente (site-vitrine, 82 %) et propose /compact
    sd.send({ event: "willAppear", action: "io.github.mathyschn.claudekit.context", context: "K2", payload: { settings: {} } });
    const ctx = svgOf(await sd.waitFor((m) => m.event === "setImage" && m.context === "K2"));
    assert.match(ctx, />82</);
    assert.match(ctx, /\/compact/);

    // réglage : valeur restante + style barre + session choisie
    sd.send({ event: "didReceiveSettings", action: "io.github.mathyschn.claudekit.context", context: "K2", payload: { settings: { value: "remaining", style: "bar", project: "ancien-projet" } } });
    const ctx2 = svgOf(await sd.waitFor((m) => m.event === "setImage" && m.context === "K2" && /\>70</.test(svgOf(m))));
    assert.match(ctx2, /<rect x="14" y="96"/, "style barre");

    // le panneau de réglages reçoit la liste des projets et un aperçu
    sd.send({ event: "propertyInspectorDidAppear", action: "io.github.mathyschn.claudekit.context", context: "K2" });
    const pi = await sd.waitFor((m) => m.event === "sendToPropertyInspector" && m.context === "K2");
    assert.deepStrictEqual(pi.payload.projects, ["site-vitrine", "ancien-projet"]);
    assert.ok(pi.payload.preview.startsWith("data:image/svg+xml"));
    assert.strictEqual(pi.payload.hasData, true);

    // appui : vue détaillée
    const before = sd.received.filter((m) => m.event === "setImage" && m.context === "K1").length;
    sd.send({ event: "keyDown", action: "io.github.mathyschn.claudekit.limit5h", context: "K1", payload: { settings: {} } });
    const alt = await sd.waitFor((m) => m.event === "setImage" && m.context === "K1" && sd.received.filter((x) => x.event === "setImage" && x.context === "K1").indexOf(m) >= before);
    assert.match(svgOf(alt), /dans (1h5\d|2h00)/);

    // un fichier modifié par Claude est repris dans la seconde
    fs.writeFileSync(path.join(fx.kit, "limits.json"), JSON.stringify({ five_hour: { kind: "five_hour", percentUsed: 91, resetsAt: new Date(Date.now() + 3600e3).toISOString(), seenAt: Date.now() } }));
    sd.send({ event: "keyDown", action: "io.github.mathyschn.claudekit.limit5h", context: "K1", payload: { settings: {} } }); // retour à la vue normale
    const updated = svgOf(await sd.waitFor((m) => m.event === "setImage" && m.context === "K1" && />91</.test(svgOf(m)), 4000));
    assert.match(updated, /#fb7185|#e11d48/, "rouge au-dessus du seuil d'alerte");
  } finally {
    child.kill();
    sd.close();
  }
});

test("actions reconnues quelle que soit la casse (Stream Deck renvoie « limitweek »)", () => {
  assert.strictEqual(resolveAction("io.github.mathyschn.claudekit.limitweek"), "limitWeek");
  assert.strictEqual(resolveAction("io.github.mathyschn.claudekit.limitWeek"), "limitWeek");
  assert.strictEqual(resolveAction("io.github.mathyschn.claudekit.limitspend"), "limitSpend");
  assert.strictEqual(resolveAction("io.github.mathyschn.claudekit.inconnue"), "overview");
  // chaque action du manifeste correspond à une touche, et ses UUID sont en minuscules comme l'exige Stream Deck
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"));
  for (const a of manifest.Actions) {
    assert.strictEqual(a.UUID, a.UUID.toLowerCase(), a.UUID);
    assert.notStrictEqual(resolveAction(a.UUID) === "overview" && !a.UUID.endsWith(".overview"), true, a.UUID);
  }
});

test("toutes les touches se dessinent sans données (Claude fermé)", () => {
  const empty = { now: Date.now(), config: {}, sessions: [], session: null, projects: [], limits: { session: null, week: null, spend: null } };
  for (const a of ["limit5h", "limitWeek", "limitSpend", "context", "cost", "git", "status", "overview"]) {
    const svg = renderKey(a, empty, {});
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  }
});
