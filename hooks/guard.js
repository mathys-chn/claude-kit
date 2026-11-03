#!/usr/bin/env node
// claude-kit · guard — PreToolUse : bloque les commandes dangereuses, demande confirmation pour les risquées,
// protège les fichiers sensibles (.env, clés…). Journal : <dossier Claude>/claude-kit/security.log
// Réglages : section « guard » de config.json (panneau /kit → Sécurité).
"use strict";
const fs = require("fs");
const path = require("path");
const config = require("./lib/config");

const cfg = config.load().guard;
if (!cfg.enabled) process.exit(0);
const LOG = path.join(config.CLAUDE_DIR, "claude-kit", "security.log");

// [regex, raison]  → refus net
const DENY = [
  [/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\/\*|~\/\*)(\s|$)/, "suppression récursive de / ou du home"],
  [/\brm\s+(-[a-zA-Z]*\s+)*--no-preserve-root/, "rm --no-preserve-root"],
  [/\bmkfs(\.\w+)?\b/, "formatage de disque"],
  [/\bdd\b.*\bof=\/dev\/(sd|nvme|disk|hd)/, "écriture brute sur un disque"],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, "fork bomb"],
  [/>\s*\/dev\/(sd|nvme|disk)/, "écrasement d'un périphérique disque"],
  [/\bchmod\s+(-R\s+)?777\s+\/(\s|$)/, "chmod 777 sur /"],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, "exécution d'un script distant (curl | sh)"],
  [/\bgit\s+push\b.*(--force|-f\b)(?!-with-lease).*\b(main|master|prod|production)\b/, "force push sur une branche protégée"],
  [/\bgit\s+push\b.*\b(main|master)\b.*(--force|-f\b)(?!-with-lease)/, "force push sur une branche protégée"],
  [/\bDROP\s+(DATABASE|SCHEMA)\b/i, "DROP DATABASE"],
  [/\bshutdown\b|\breboot\b|\bhalt\b\s*$/, "extinction / redémarrage machine"],
];

// [regex, raison]  → on demande ton accord
const ASK = [
  [/\bsudo\b/, "commande sudo"],
  [/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/, "suppression récursive"],
  [/\bgit\s+reset\s+--hard\b/, "git reset --hard (perte de modifications)"],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, "git clean -f (supprime les fichiers non suivis)"],
  [/\bgit\s+push\b.*(--force|-f\b)/, "force push"],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, "annulation de toutes les modifications locales"],
  [/\bgit\s+branch\s+-D\b/, "suppression forcée de branche"],
  [/\b(npm|pnpm|yarn|bun)\s+publish\b/, "publication d'un package"],
  [/\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i, "DELETE sans WHERE"],
  [/\bTRUNCATE\s+TABLE\b|\bDROP\s+TABLE\b/i, "suppression de table"],
  [/\b(prisma\s+migrate\s+reset|supabase\s+db\s+reset)\b/, "reset de base de données"],
  [/\bchmod\s+-R\b|\bchown\s+-R\b/, "changement récursif de droits"],
  [/\bkill\s+-9\b|\bpkill\b|\bkillall\b/, "arrêt forcé de processus"],
];

// Fichiers sensibles (lecture/écriture → confirmation)
const SENSITIVE = [
  /(^|\/)\.env(\.[\w.-]+)?$/,
  /(^|\/)\.ssh\//,
  /\.(pem|key|p12|pfx|keystore|jks)$/,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/,
  /(^|\/)\.aws\/credentials$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.claude\/\.credentials\.json$/,
  /secrets?\.(json|ya?ml|toml)$/,
];
const SAFE_ENV = /\.env\.(example|sample|template|dist)$/;

function log(level, tool, detail, reason) {
  if (!cfg.log) return;
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()}\t${level}\t${tool}\t${reason}\t${detail.replace(/\s+/g, " ").slice(0, 300)}\n`);
  } catch {}
}

function decide(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: `🛡️ claude-kit : ${reason}`,
      },
    })
  );
  process.exit(0);
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const tool = input.tool_name || "";
  const ti = input.tool_input || {};

  if (tool === "Bash") {
    const cmd = String(ti.command || "");
    if (cfg.blockDangerous) for (const [re, why] of DENY) if (re.test(cmd)) { log("DENY", tool, cmd, why); decide("deny", `bloqué — ${why}`); }
    if (cfg.askRisky) for (const [re, why] of ASK) if (re.test(cmd)) { log("ASK", tool, cmd, why); decide("ask", `confirmation requise — ${why}`); }
    // lecture de secrets via le shell
    if (cfg.protectSecrets && /\b(cat|less|more|head|tail|bat)\b[^|;&]*\.env\b(?!\.(example|sample|template))/.test(cmd)) {
      log("ASK", tool, cmd, "lecture .env"); decide("ask", "lecture d'un fichier .env");
    }
  }

  if (cfg.protectSecrets && ["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const p = String(ti.file_path || ti.notebook_path || "");
    if (p && !SAFE_ENV.test(p) && SENSITIVE.some((re) => re.test(p))) {
      log("ASK", tool, p, "fichier sensible");
      decide("ask", `fichier sensible (${path.basename(p)})`);
    }
  }
  process.exit(0);
});
