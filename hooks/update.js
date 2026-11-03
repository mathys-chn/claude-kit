#!/usr/bin/env node
// claude-kit · mises à jour depuis GitHub.
//   --auto        (hook SessionStart) : rend la main tout de suite, vérifie en arrière-plan si c'est l'heure
//   --check       vérifie et affiche l'état (JSON)
//   --now         vérifie et installe la nouvelle version s'il y en a une
// État : <dossier Claude>/claude-kit/update.json · journal : update.log
// Réglages : section « updates » de config.json (panneau /kit → À propos).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const config = require("./lib/config");

const cfg = config.load().updates;
const KIT = path.join(config.CLAUDE_DIR, "claude-kit");
const STATUS = path.join(KIT, "update.json");
const LOCK = path.join(KIT, "update.lock");
const LOG = path.join(KIT, "update.log");
const REPO = String(cfg.repo || "mathys-chn/claude-kit");
const BRANCH = String(cfg.branch || "main");
// Surchargeables pour les tests (serveur local) ou un miroir
const RAW_BASE = process.env.CLAUDE_KIT_UPDATE_BASE || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const ARCHIVE_URL = process.env.CLAUDE_KIT_UPDATE_ARCHIVE || `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;

const readJSON = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; }
};
const writeJSON = (f, obj) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj, null, 2) + "\n");
};
const log = (msg) => {
  try {
    fs.mkdirSync(KIT, { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
};

function compare(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

const currentVersion = () => readJSON(path.join(KIT, "version.json"), {}).version || "0.0.0";

function setStatus(patch) {
  const next = { ...readJSON(STATUS, {}), ...patch, repo: REPO, mode: cfg.mode };
  writeJSON(STATUS, next);
  return next;
}

async function get(url, timeoutMs = 10_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "claude-kit-updater" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
}

// Les notes de la version (section du CHANGELOG), pour les afficher dans /kit
function notesFor(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${version}`));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith("## ")) break;
    if (l.startsWith("- ")) out.push(l.slice(2).replace(/\*\*/g, "").replace(/`/g, ""));
  }
  return out.slice(0, 6);
}

async function check() {
  const current = currentVersion();
  try {
    const latest = (await (await get(`${RAW_BASE}/VERSION`)).text()).trim();
    if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error(`version distante illisible : ${latest.slice(0, 40)}`);
    let notes = [];
    try { notes = notesFor(await (await get(`${RAW_BASE}/CHANGELOG.md`)).text(), latest); } catch {}
    const isNewer = compare(latest, current) > 0;
    return setStatus({ current, latest, notes, checkedAt: Date.now(), state: isNewer ? "available" : "up-to-date", message: "" });
  } catch (err) {
    log(`vérification impossible : ${err.message}`);
    return setStatus({ current, checkedAt: Date.now(), state: "error", message: "Vérification impossible (pas de connexion ?)" });
  }
}

function takeLock() {
  try {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    if (age < 10 * 60_000) return false; // une autre session met déjà à jour
  } catch {}
  fs.mkdirSync(KIT, { recursive: true });
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}

// Télécharge l'archive du dépôt, la décompresse et relance l'installeur en mode silencieux
async function install(status) {
  if (!takeLock()) return status;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-kit-update-"));
  try {
    setStatus({ state: "updating", message: `Téléchargement de la version ${status.latest}…` });
    const archive = path.join(tmp, "kit.tar.gz");
    fs.writeFileSync(archive, Buffer.from(await (await get(ARCHIVE_URL, 60_000)).arrayBuffer()));
    const out = path.join(tmp, "src");
    fs.mkdirSync(out);
    // tar est fourni par macOS, Linux et Windows 10+
    const untar = spawnSync("tar", ["-xzf", archive, "-C", out], { encoding: "utf8" });
    if (untar.status !== 0) throw new Error(`décompression impossible : ${untar.stderr || untar.error}`);
    const candidates = [out, ...fs.readdirSync(out).map((n) => path.join(out, n))];
    const src = candidates.find((d) => fs.existsSync(path.join(d, "install.js")) && fs.existsSync(path.join(d, "VERSION")));
    if (!src) throw new Error("archive sans install.js");
    const version = fs.readFileSync(path.join(src, "VERSION"), "utf8").trim();
    if (compare(version, currentVersion()) <= 0) throw new Error(`l'archive contient ${version}, pas plus récent`);
    const run = spawnSync(process.execPath, [path.join(src, "install.js"), "--update"], { encoding: "utf8", env: process.env, timeout: 120_000 });
    log(`install ${version} :\n${run.stdout || ""}${run.stderr || ""}`);
    if (run.status !== 0) throw new Error(`l'installeur a échoué (code ${run.status})`);
    log(`mis à jour : ${status.current} → ${version}`);
    return setStatus({ state: "installed", current: version, latest: version, previous: status.current, installedAt: Date.now(), message: "" });
  } catch (err) {
    log(`mise à jour échouée : ${err.message}`);
    return setStatus({ state: "error", message: `Mise à jour échouée : ${err.message}` });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.unlinkSync(LOCK); } catch {}
  }
}

async function main() {
  const arg = process.argv[2] || "--check";
  if (arg === "--auto") {
    // Hook de démarrage : ne jamais ralentir Claude. On relance ce script détaché et on rend la main.
    if (cfg.mode === "off" || process.env.CLAUDE_KIT_UPDATE === "0") return;
    const last = readJSON(STATUS, {}).checkedAt || 0;
    if (Date.now() - last < Math.max(1, Number(cfg.intervalHours) || 6) * 3600_000) return;
    spawn(process.execPath, [__filename, "--background"], { detached: true, stdio: "ignore", env: process.env }).unref();
    return;
  }
  if (arg === "--background") {
    const status = await check();
    if (status.state === "available" && cfg.mode === "auto") await install(status);
    return;
  }
  if (arg === "--now") {
    const status = await check();
    const result = status.state === "available" ? await install(status) : status;
    process.stdout.write(JSON.stringify(result));
    return;
  }
  process.stdout.write(JSON.stringify(await check()));
}

if (require.main === module) {
  main()
    .catch((err) => log(`erreur : ${err.message}`))
    .finally(() => process.exit(0));
}

module.exports = { compare, notesFor };
