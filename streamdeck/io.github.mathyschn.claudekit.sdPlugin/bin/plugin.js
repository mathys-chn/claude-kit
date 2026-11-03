// claude-kit pour Stream Deck — affiche sur les touches les infos publiées par la bande kit-band
// (app Claude, VS Code ou terminal). Zéro dépendance : Node fourni par l'application Stream Deck.
"use strict";
const { WebSocketClient } = require("./ws");
const { snapshot, fingerprint, kitDir } = require("./data");
const { renderKey, resolveAction, toDataUrl, DEFAULT_SETTINGS } = require("./render");

// L'application Stream Deck lance le plugin avec : -port N -pluginUUID X -registerEvent Y -info JSON
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("-")) out[argv[i].slice(1)] = argv[i + 1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const ws = new WebSocketClient(Number(args.port));
const keys = new Map(); // context → { action, settings, alt, lastImage }
let lastPrint = "";
let lastMinute = -1;
let tick = 0;

const send = (event, context, payload) => ws.send(JSON.stringify({ event, context, ...(payload !== undefined && { payload }) }));
const log = (message) => ws.send(JSON.stringify({ event: "logMessage", payload: { message: `[claude-kit] ${message}` } }));

function draw(context, force = false) {
  const key = keys.get(context);
  if (!key) return;
  const snap = snapshot({ project: key.settings.project });
  const svg = renderKey(key.action, snap, key.settings, key.alt, tick);
  if (!force && svg === key.lastImage) return;
  key.lastImage = svg;
  send("setImage", context, { image: toDataUrl(svg), target: 0 });
}

function drawAll(force = false) {
  for (const context of keys.keys()) draw(context, force);
}

// Envoie au panneau de réglages la liste des projets ouverts et l'aperçu de la touche
function feedInspector(context) {
  const key = keys.get(context);
  if (!key) return;
  const snap = snapshot({ project: key.settings.project });
  send("sendToPropertyInspector", context, {
    type: "state",
    projects: snap.projects,
    hasData: Boolean(snap.session) || Boolean(snap.limits.session),
    kitDir: kitDir(),
    preview: toDataUrl(renderKey(key.action, snap, key.settings, false, tick)),
  });
}

ws.on("open", () => {
  ws.send(JSON.stringify({ event: args.registerEvent, uuid: args.pluginUUID }));
});

ws.on("message", (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const { event, context, action, payload = {} } = msg;
  switch (event) {
    case "willAppear":
      keys.set(context, { action: resolveAction(action), settings: { ...DEFAULT_SETTINGS, ...(payload.settings || {}) }, alt: false, lastImage: "" });
      send("setTitle", context, { title: "", target: 0 });
      draw(context, true);
      break;
    case "willDisappear":
      keys.delete(context);
      break;
    case "didReceiveSettings": {
      const key = keys.get(context);
      if (key) {
        key.settings = { ...DEFAULT_SETTINGS, ...(payload.settings || {}) };
        draw(context, true);
        feedInspector(context);
      }
      break;
    }
    case "keyDown": {
      const key = keys.get(context);
      if (!key) break;
      if (key.settings.press === "toggle") key.alt = !key.alt;
      draw(context, true);
      // la vue détaillée revient seule à la normale après 6 s
      if (key.alt) setTimeout(() => {
        const k = keys.get(context);
        if (k && k.alt) {
          k.alt = false;
          draw(context, true);
        }
      }, 6000);
      break;
    }
    case "propertyInspectorDidAppear":
    case "sendToPlugin":
      feedInspector(context);
      break;
  }
});

ws.on("error", (err) => {
  // pas de console visible : l'erreur va dans le journal du plugin quand c'est possible
  try { log(err.message); } catch {}
});
ws.on("close", () => process.exit(0));

// Une fois par seconde : redessine si un fichier a changé, si la minute a changé (comptes à rebours)
// ou si Claude travaille (animation de la touche Statut)
setInterval(() => {
  tick++;
  const print = fingerprint(kitDir());
  const minute = Math.floor(Date.now() / 60_000);
  const hasStatus = [...keys.values()].some((k) => k.action === "status");
  if (print !== lastPrint || minute !== lastMinute) {
    lastPrint = print;
    lastMinute = minute;
    drawAll();
  } else if (hasStatus) {
    for (const [context, k] of keys) if (k.action === "status") draw(context);
  }
}, 1000);
