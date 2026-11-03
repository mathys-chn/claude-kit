#!/usr/bin/env node
// claude-kit · installeur — macOS / Linux / WSL / Windows. Node >= 18, zéro dépendance.
//   node install.js              installe (sauvegarde automatique de ta config)
//   node install.js --force      écrase aussi les skills/agents qui portent le même nom
//   node install.js --icons=nerd choisit les icônes de la statusline (nerd | unicode | ascii)
//   node install.js --name="Ton nom"  texte de la pastille de la bande (sinon la question est posée)
//   node install.js --keep-aiblueprint  garde aussi la bande d'aiblueprint (sinon elle est remplacée)
//   node install.js --uninstall  retire claude-kit et restaure la dernière sauvegarde de settings.json
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const UNINSTALL = args.includes("--uninstall");
const KEEP_AIBP = args.includes("--keep-aiblueprint");
const argValue = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.slice(name.length + 3);
};
const ICONS = argValue("icons");
const NAME = argValue("name");

const SRC = __dirname;
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const KIT = path.join(CLAUDE, "claude-kit");
const SETTINGS = path.join(CLAUDE, "settings.json");
const MARK_START = "<!-- claude-kit:start -->";
const MARK_END = "<!-- claude-kit:end -->";

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const v = (s) => `\x1b[38;2;167;139;250m${s}\x1b[0m`;
const ok = (s) => console.log(`  ${g("✔")} ${s}`);
const skip = (s) => console.log(`  ${y("•")} ${s}`);

const posix = (p) => p.split(path.sep).join("/");
const nodeCmd = (script) => `node "${posix(path.join(KIT, script))}"`;

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
function copyDir(from, to, { overwrite = true } = {}) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, { overwrite });
    else if (overwrite || !fs.existsSync(b)) fs.copyFileSync(a, b);
  }
}
const isKitHook = (h) => typeof h?.command === "string" && h.command.includes("claude-kit");

// ─────────────── Désinstallation ───────────────
if (UNINSTALL) {
  console.log(v("\n  claude-kit · désinstallation\n"));
  const s = readJSON(SETTINGS, {});
  for (const ev of Object.keys(s.hooks || {})) {
    s.hooks[ev] = s.hooks[ev]
      .map((m) => ({ ...m, hooks: (m.hooks || []).filter((h) => !isKitHook(h)) }))
      .filter((m) => m.hooks.length);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  const manifest = readJSON(path.join(KIT, "manifest.json"), { files: [] });
  if (s.env?.CLAUDE_CODE_PLUGIN_DIRS !== undefined) {
    const mods = [...(manifest.mods || []), path.join(CLAUDE, "mods", "mch-band")];
    const dirs = s.env.CLAUDE_CODE_PLUGIN_DIRS.split(path.delimiter).filter((d) => d && !mods.includes(d));
    for (const d of manifest.removedPluginDirs || []) if (!dirs.includes(d) && fs.existsSync(d)) dirs.push(d);
    if (dirs.length) s.env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(path.delimiter);
    else delete s.env.CLAUDE_CODE_PLUGIN_DIRS;
    if (!Object.keys(s.env).length) delete s.env;
    for (const d of mods) fs.rmSync(d, { recursive: true, force: true });
    if (mods.length) ok("bande kit-band retirée" + ((manifest.removedPluginDirs || []).length ? ", bande aiblueprint réactivée" : ""));
  }
  if (s.statusLine?.command?.includes("claude-kit")) {
    if (manifest.previousStatusLine) s.statusLine = manifest.previousStatusLine;
    else delete s.statusLine;
  }
  writeJSON(SETTINGS, s); ok("hooks retirés, statusline d'origine restaurée");
  for (const f of manifest.files) { try { fs.rmSync(f, { recursive: true, force: true }); } catch {} }
  ok(`${manifest.files.length} skills/agents/styles supprimés`);
  const md = path.join(CLAUDE, "CLAUDE.md");
  if (fs.existsSync(md)) {
    const txt = fs.readFileSync(md, "utf8");
    const re = new RegExp(`\\n?${MARK_START}[\\s\\S]*?${MARK_END}\\n?`);
    fs.writeFileSync(md, txt.replace(re, "\n").trim() + "\n"); ok("section claude-kit retirée de CLAUDE.md");
  }
  console.log(`\n  Sauvegardes conservées dans ${posix(path.join(KIT, "backups"))}\n`);
  process.exit(0);
}

// ─────────────── Installation ───────────────
const [maj] = process.versions.node.split(".").map(Number);
if (maj < 18) { console.error("claude-kit nécessite Node 18+"); process.exit(1); }

function ask(question) {
  return new Promise((resolve) => {
    const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

(async () => {
  // Nom de la pastille : demandé une seule fois, à la première installation
  const already = readJSON(path.join(KIT, "config.json"), null);
  if (NAME === undefined && !already?.band && process.stdin.isTTY) {
    const answer = await ask(`  Nom à afficher dans la bande (entrée = aucun) : `);
    install(answer);
  } else install(undefined);
})();

function install(askedName) {

console.log(v(`
   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗   ██╗  ██╗██╗████████╗
  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝   ██║ ██╔╝██║╚══██╔══╝
  ██║     ██║     ███████║██║   ██║██║  ██║█████╗     █████╔╝ ██║   ██║
  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝     ██╔═██╗ ██║   ██║
  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗   ██║  ██╗██║   ██║
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝  ╚═╝╚═╝   ╚═╝`));
console.log(`  → ${posix(CLAUDE)}\n`);

// 1. Sauvegarde
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = path.join(KIT, "backups", stamp);
fs.mkdirSync(backup, { recursive: true });
for (const f of ["settings.json", "CLAUDE.md"]) {
  const p = path.join(CLAUDE, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(backup, f));
}
ok(`sauvegarde → ${posix(backup)}`);

// 2. Scripts (statusline + hooks)
copyDir(path.join(SRC, "statusline"), path.join(KIT, "statusline"));
copyDir(path.join(SRC, "hooks"), path.join(KIT, "hooks"));
ok("statusline + 5 hooks copiés");

// 3. Configuration unique du kit (bande, notifications, sécurité, formatage, statusline)
const kitConfig = require(path.join(SRC, "hooks", "lib", "config.js"));
const cfgPath = path.join(KIT, "config.json");
const existing = kitConfig.migrate(readJSON(cfgPath, {}));
const cfg = kitConfig.merge(kitConfig.DEFAULTS, existing);
if (ICONS) cfg.statusline.icons = ICONS;
const name = NAME !== undefined ? NAME : askedName;
if (name !== undefined) cfg.band.brandLabel = String(name).trim().slice(0, 16);
writeJSON(cfgPath, cfg);
ok(`réglages → ${posix(cfgPath)}${existing && Object.keys(existing).length ? " (tes réglages sont conservés)" : ""}`);

// 4. Skills, agents, output styles
const manifest = { files: [] };
for (const [dir, isFolder] of [["skills", true], ["agents", false], ["output-styles", false]]) {
  const from = path.join(SRC, dir);
  const to = path.join(CLAUDE, dir);
  fs.mkdirSync(to, { recursive: true });
  let n = 0, kept = 0;
  for (const name of fs.readdirSync(from)) {
    const dst = path.join(to, name);
    if (fs.existsSync(dst) && !FORCE) { kept++; continue; }
    if (isFolder) copyDir(path.join(from, name), dst); else fs.copyFileSync(path.join(from, name), dst);
    manifest.files.push(dst); n++;
  }
  ok(`${n} ${dir} installés${kept ? y(` (${kept} déjà présents gardés — --force pour écraser)`) : ""}`);
}
const prev = readJSON(path.join(KIT, "manifest.json"), { files: [] });
writeJSON(path.join(KIT, "manifest.json"), { ...prev, files: [...new Set([...(prev.files || []), ...manifest.files])] });

// 4b. Mods (bande au-dessus du prompt, app de bureau / terminal / VS Code)
const MODS_SRC = path.join(SRC, "mods");
const modNames = fs.existsSync(MODS_SRC) ? fs.readdirSync(MODS_SRC).filter((n) => fs.statSync(path.join(MODS_SRC, n)).isDirectory()) : [];
// mch-band (ancien nom de kit-band) : on le retire pour ne pas avoir deux bandes
const legacyBand = path.join(CLAUDE, "mods", "mch-band");
if (fs.existsSync(legacyBand)) { fs.rmSync(legacyBand, { recursive: true, force: true }); ok("ancienne bande mch-band remplacée par kit-band"); }
for (const name of modNames) {
  const dst = path.join(CLAUDE, "mods", name);
  fs.rmSync(dst, { recursive: true, force: true });
  copyDir(path.join(MODS_SRC, name), dst);
}
if (modNames.length) ok(`mod ${modNames.join(", ")} installé (bande au-dessus du prompt)`);

// 5. CLAUDE.md global (section délimitée, jamais d'écrasement)
const mdPath = path.join(CLAUDE, "CLAUDE.md");
const block = `${MARK_START}\n${fs.readFileSync(path.join(SRC, "CLAUDE.md"), "utf8").trim()}\n${MARK_END}`;
let md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
md = md.includes(MARK_START)
  ? md.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), block)
  : (md.trim() ? md.trim() + "\n\n" : "") + block + "\n";
fs.writeFileSync(mdPath, md);
ok("préférences ajoutées à CLAUDE.md (section claude-kit)");

// 6. settings.json (fusion)
const s = readJSON(SETTINGS, {});
if (s.statusLine && !String(s.statusLine.command || "").includes("claude-kit")) {
  const m = readJSON(path.join(KIT, "manifest.json"), { files: [] });
  m.previousStatusLine = s.statusLine;
  writeJSON(path.join(KIT, "manifest.json"), m);
}
s.statusLine = { type: "command", command: nodeCmd("statusline/statusline.js"), padding: 0 };
s.hooks = s.hooks || {};
const addHook = (event, matcher, script, timeout) => {
  s.hooks[event] = (s.hooks[event] || [])
    .map((m) => ({ ...m, hooks: (m.hooks || []).filter((h) => !isKitHook(h)) }))
    .filter((m) => m.hooks.length);
  const entry = { hooks: [{ type: "command", command: nodeCmd(script), ...(timeout ? { timeout } : {}) }] };
  if (matcher) entry.matcher = matcher;
  s.hooks[event].push(entry);
};
// Un hook par événement ; ré-exécuter l'installeur remplace les anciens hooks claude-kit sans doublon
const plan = [
  ["PreToolUse", "Bash|Read|Edit|Write|MultiEdit|NotebookEdit", "hooks/guard.js", 10],
  ["PostToolUse", "Edit|Write|MultiEdit", "hooks/format.js", 30],
  ["SessionStart", "startup|resume|clear", "hooks/session-start.js", 10],
  ["UserPromptSubmit", null, "hooks/prompt-stamp.js", 5],
  ["Stop", null, "hooks/notify.js", 10],
  ["Notification", null, "hooks/notify.js", 10],
];
for (const [ev, m, script, t] of plan) addHook(ev, m, script, t);
if (modNames.length) {
  s.env = s.env || {};
  let dirs = (s.env.CLAUDE_CODE_PLUGIN_DIRS || "").split(path.delimiter).filter((d) => d && !/[\\/]mods[\\/]mch-band[\\/]?$/.test(d));
  const removed = [];
  if (!KEEP_AIBP) {
    dirs = dirs.filter((d) => {
      const isAibp = /[\\/]mods[\\/]aiblueprint[\\/]?$/.test(d);
      if (isAibp) removed.push(d);
      return !isAibp;
    });
  }
  for (const name of modNames) {
    const d = path.join(CLAUDE, "mods", name);
    if (!dirs.includes(d)) dirs.push(d);
  }
  s.env.CLAUDE_CODE_PLUGIN_DIRS = dirs.join(path.delimiter);
  const m = readJSON(path.join(KIT, "manifest.json"), { files: [] });
  m.mods = modNames.map((n) => path.join(CLAUDE, "mods", n));
  m.removedPluginDirs = [...new Set([...(m.removedPluginDirs || []), ...removed])];
  writeJSON(path.join(KIT, "manifest.json"), m);
  if (removed.length) ok("bande aiblueprint désactivée (remplacée par kit-band) — --keep-aiblueprint pour la garder");
}
writeJSON(SETTINGS, s);
ok("settings.json fusionné (statusline + hooks)");

console.log(`
  ${g("Installé !")} Redémarre Claude Code (ou l'app de bureau), puis :

    ${v("/kit")}     réglages : bande, couleurs, notifications, sécurité, automatisations
    ${v("/cheat")}   aide-mémoire des commandes

  Fichier de réglages : ${posix(cfgPath)}
  Désinstaller        : node install.js --uninstall
`);
}
