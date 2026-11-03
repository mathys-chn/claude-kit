#!/usr/bin/env node
// claude-kit · session-start — SessionStart : donne à Claude un petit état des lieux du repo
// (branche, modifs en cours, 5 derniers commits) pour qu'il soit opérationnel tout de suite.
// Réglages : section « sessionContext » de config.json (panneau /kit → Automatisations).
"use strict";
const { execFileSync } = require("child_process");
const config = require("./lib/config");

const cfg = config.load().sessionContext;
if (!cfg.enabled) process.exit(0);
const commits = Math.max(1, Math.min(20, Number(cfg.commits) || 5));

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  const cwd = input.cwd || process.cwd();
  const git = (a) => execFileSync("git", a, { cwd, encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const status = git(["status", "--short"]).split("\n").filter(Boolean);
    const log = git(["log", "--oneline", `-${commits}`, "--no-decorate"]);
    const ctx = [
      `## État du repo (claude-kit)`,
      `- Branche : ${branch}`,
      `- Fichiers modifiés non commités : ${status.length}${status.length ? "\n" + status.slice(0, 15).map((s) => "  " + s).join("\n") : ""}`,
      `- ${commits} derniers commits :\n${log.split("\n").map((l) => "  " + l).join("\n")}`,
    ].join("\n");
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }));
  } catch {}
  process.exit(0);
});
