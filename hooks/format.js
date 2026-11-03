#!/usr/bin/env node
// claude-kit · format — PostToolUse (Edit/Write) : formate le fichier modifié avec l'outil du projet
// (Biome, Prettier, Ruff, gofmt, rustfmt) s'il est installé. Silencieux, ne bloque jamais.
// Réglages : section « format » de config.json (panneau /kit → Automatisations). Coupure ponctuelle : CLAUDE_KIT_FORMAT=0
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const config = require("./lib/config");

const cfg = config.load().format;
if (process.env.CLAUDE_KIT_FORMAT === "0" || !cfg.enabled) process.exit(0);

function findUp(start, names) {
  let dir = start;
  while (true) {
    for (const n of names) if (fs.existsSync(path.join(dir, n))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const has = (bin) => {
  try { execFileSync(process.platform === "win32" ? "where" : "which", [bin], { stdio: "ignore" }); return true; } catch { return false; }
};
const run = (cmd, args, cwd) => {
  try { execFileSync(cmd, args, { cwd, stdio: "ignore", timeout: 15000 }); } catch {}
};

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const file = input.tool_input?.file_path;
  if (!file || !fs.existsSync(file)) process.exit(0);
  const ext = path.extname(file).toLowerCase();
  const dir = path.dirname(file);

  const web = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html", ".md", ".mdx", ".vue", ".svelte", ".astro", ".yaml", ".yml"];
  if (cfg.web && web.includes(ext)) {
    const biome = findUp(dir, ["biome.json", "biome.jsonc"]);
    const prettier = findUp(dir, [".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.cjs", ".prettierrc.mjs", "prettier.config.js", "prettier.config.mjs", ".prettierrc.yaml"]);
    if (biome && fs.existsSync(path.join(biome, "node_modules", ".bin", "biome"))) {
      run(path.join(biome, "node_modules", ".bin", "biome"), ["format", "--write", file], biome);
    } else if (prettier && fs.existsSync(path.join(prettier, "node_modules", ".bin", "prettier"))) {
      run(path.join(prettier, "node_modules", ".bin", "prettier"), ["--write", "--log-level", "silent", file], prettier);
    }
  } else if (cfg.python && ext === ".py" && has("ruff")) {
    run("ruff", ["format", "--quiet", file], dir);
  } else if (cfg.go && ext === ".go" && has("gofmt")) {
    run("gofmt", ["-w", file], dir);
  } else if (cfg.rust && ext === ".rs" && has("rustfmt")) {
    run("rustfmt", ["--edition", "2021", file], dir);
  }
  process.exit(0);
});
