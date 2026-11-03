// claude-kit · configuration partagée
// Un seul fichier pour tout le kit : <dossier Claude>/claude-kit/config.json
// (le panneau « /kit » de la bande l'écrit ; on peut aussi l'éditer à la main).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const CONFIG_PATH = path.join(CLAUDE_DIR, "claude-kit", "config.json");

const DEFAULTS = {
  version: 2,
  general: {
    currency: "USD", // "USD" | "EUR"
    usdToEur: 0.92,
    budgetPerSession: 5, // $ : au-delà, le coût passe en rouge
  },
  band: {
    order: ["brand", "five-hour", "week", "spend", "ctx", "cost", "git", "turn", "model"],
    hidden: ["model"],
    layout: "two", // "one" | "two"
    chip: "round", // "round" | "pill" | "outline" | "plain"
    preset: "violet",
    accent: "#7c3aed",
    accent2: "#c4b5fd",
    brandLabel: "",
    showPace: true,
    showResetClock: true,
  },
  notifications: {
    enabled: true,
    onStop: true, // tâche terminée
    onPermission: true, // Claude attend ton accord
    minDurationSec: 20, // pas de notif « terminé » pour les tâches plus courtes
    sound: true,
    soundName: "Glass", // macOS : Glass, Ping, Pop, Hero, Submarine, Funk, Tink, Purr
    quietHours: { enabled: false, start: 22, end: 8 },
  },
  guard: {
    enabled: true,
    blockDangerous: true, // rm -rf /, curl | sh, force push sur main…
    askRisky: true, // sudo, reset --hard, DELETE sans WHERE…
    protectSecrets: true, // .env, clés SSH, credentials
    log: true, // journal dans claude-kit/security.log
  },
  format: {
    enabled: true,
    web: true, // Biome ou Prettier (JS, TS, CSS, JSON, Markdown…)
    python: true, // Ruff
    go: true, // gofmt
    rust: true, // rustfmt
  },
  sessionContext: {
    enabled: true,
    commits: 5,
  },
  streamdeck: {
    publish: true, // la bande écrit l'état des sessions pour le plugin Stream Deck
  },
  statusline: {
    icons: "unicode", // "nerd" | "unicode" | "ascii"
    barWidth: 10,
    show: { model: true, dir: true, git: true, lines: true, context: true, cost: true, duration: true, limits: true, clock: true, outputStyle: true },
  },
};

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

function merge(base, over) {
  if (!isObject(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObject(base[k]) && isObject(v) ? merge(base[k], v) : v;
  }
  return out;
}

// Ancien format (v1) : les réglages de la statusline étaient à la racine
function migrate(raw) {
  if (!isObject(raw) || raw.version >= 2) return raw;
  const { icons, barWidth, show, currency, usdToEur, budgetPerSession, ...rest } = raw;
  return {
    ...rest,
    version: 2,
    general: { ...(currency && { currency }), ...(usdToEur && { usdToEur }), ...(budgetPerSession && { budgetPerSession }) },
    statusline: { ...(icons && { icons }), ...(barWidth && { barWidth }), ...(show && { show }) },
  };
}

function load() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {}
  return merge(DEFAULTS, migrate(raw));
}

module.exports = { CLAUDE_DIR, CONFIG_PATH, DEFAULTS, load, merge, migrate };
