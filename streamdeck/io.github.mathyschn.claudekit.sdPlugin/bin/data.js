// Lecture des fichiers que publie claude-kit (la bande kit-band, dans l'app Claude, VS Code ou le terminal) :
//   <dossier Claude>/claude-kit/config.json        réglages et thème
//   <dossier Claude>/claude-kit/limits.json        limites 5 h / semaine / budget, partagées
//   <dossier Claude>/claude-kit/sessions/<id>.json état de chaque session ouverte
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOUR = 3_600_000;
const SESSION_MS = 5 * HOUR;
const WEEK_MS = 7 * 24 * HOUR;
const ACTIVE_MS = 6 * HOUR; // au-delà, une session est considérée comme fermée

function kitDir(override) {
  const base = override || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  return path.join(base, "claude-kit");
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// Empreinte des fichiers suivis : change dès qu'un fichier est modifié, ajouté ou supprimé
function fingerprint(dir) {
  const parts = [mtime(path.join(dir, "config.json")), mtime(path.join(dir, "limits.json"))];
  try {
    for (const name of fs.readdirSync(path.join(dir, "sessions"))) parts.push(name, mtime(path.join(dir, "sessions", name)));
  } catch {}
  return parts.join("|");
}

function toLimit(l, windowMs, now) {
  if (!l || typeof l.percentUsed !== "number") return null;
  const resetsAtMs = l.resetsAt ? new Date(l.resetsAt).getTime() : undefined;
  const isReset = resetsAtMs !== undefined && resetsAtMs <= now;
  const percent = isReset ? 0 : l.percentUsed;
  const resetsInMs = resetsAtMs !== undefined && !isReset ? resetsAtMs - now : undefined;
  const out = { percent, resetsAtMs: isReset ? undefined : resetsAtMs, resetsInMs, ageMs: Math.max(0, now - (l.seenAt || now)), isReset };
  if (windowMs && resetsInMs !== undefined) {
    const elapsed = Math.max(1, windowMs - resetsInMs);
    out.timePct = (elapsed / windowMs) * 100;
    out.pace = out.timePct - percent;
    if (percent > 0 && percent < 100) {
      const emptyInMs = ((100 - percent) / percent) * elapsed;
      if (emptyInMs < resetsInMs) {
        out.emptyInMs = emptyInMs;
        out.emptyAtMs = now + emptyInMs;
      }
    }
    if (windowMs === WEEK_MS) out.perDay = (100 - percent) / Math.max(resetsInMs / (24 * HOUR), 0.25);
  }
  return out;
}

function listSessions(dir, now) {
  const sessionsDir = path.join(dir, "sessions");
  let names = [];
  try {
    names = fs.readdirSync(sessionsDir).filter((n) => n.endsWith(".json"));
  } catch {}
  return names
    .map((n) => readJSON(path.join(sessionsDir, n)))
    .filter((s) => s && typeof s.updatedAt === "number" && now - s.updatedAt < ACTIVE_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Tout ce qu'il faut pour dessiner les touches, à un instant donné
function snapshot({ dir, project, now = Date.now() } = {}) {
  const kit = kitDir(dir);
  const config = readJSON(path.join(kit, "config.json")) || {};
  const limits = readJSON(path.join(kit, "limits.json")) || {};
  const sessions = listSessions(kit, now);
  const session = (project && sessions.find((s) => s.project === project)) || sessions[0] || null;
  return {
    now,
    config,
    sessions,
    session,
    projects: [...new Set(sessions.map((s) => s.project))],
    limits: {
      session: toLimit(limits.five_hour, SESSION_MS, now),
      week: toLimit(limits.seven_day, WEEK_MS, now),
      spend: toLimit(limits.spend_limit, undefined, now),
    },
  };
}

module.exports = { kitDir, snapshot, fingerprint, toLimit, HOUR, SESSION_MS, WEEK_MS };
