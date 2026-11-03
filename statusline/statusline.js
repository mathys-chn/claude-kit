#!/usr/bin/env node
// claude-kit · statusline — zéro dépendance, Node >= 18
// Lit le JSON envoyé par Claude Code sur stdin et affiche 2 lignes d'infos utiles.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// ───────────────────────── Config ─────────────────────────
// Réglages : sections « statusline » et « general » de claude-kit/config.json
const kitConfig = require("../hooks/lib/config").load();
const cfg = { ...kitConfig.general, ...kitConfig.statusline, show: kitConfig.statusline.show };

// ───────────────────────── Couleurs ─────────────────────────
const NO_COLOR = !!process.env.NO_COLOR;
const c = (code) => (s) => (NO_COLOR ? String(s) : `\x1b[${code}m${s}\x1b[0m`);
const rgb = (r, g, b) => (s) => (NO_COLOR ? String(s) : `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`);
const dim = c("2");
const bold = c("1");
const C = {
  violet: rgb(167, 139, 250),
  blue: rgb(96, 165, 250),
  cyan: rgb(34, 211, 238),
  green: rgb(74, 222, 128),
  yellow: rgb(250, 204, 21),
  orange: rgb(251, 146, 60),
  red: rgb(248, 113, 113),
  pink: rgb(244, 114, 182),
  grey: rgb(148, 163, 184),
};

const ICONS = {
  nerd: { model: "󰚩", dir: "", branch: "", ctx: "󰍛", cost: "󰄛", time: "󰔟", limit: "󰓅", clock: "", style: "󰏘", lines: "" },
  unicode: { model: "◆", dir: "▸", branch: "⎇", ctx: "◔", cost: "$", time: "⏱", limit: "⚡", clock: "◷", style: "✎", lines: "±" },
  ascii: { model: "*", dir: ">", branch: "git:", ctx: "ctx", cost: "$", time: "t", limit: "5h", clock: "@", style: "~", lines: "+-" },
};
const I = ICONS[cfg.icons] || ICONS.unicode;
const SEP = dim(" │ ");

// ───────────────────────── Utils ─────────────────────────
const pctColor = (p) => (p < 50 ? C.green : p < 70 ? C.yellow : p < 85 ? C.orange : C.red);

function bar(pct, width = cfg.barWidth) {
  const p = Math.max(0, Math.min(100, pct));
  const exact = (p / 100) * width;
  const full = Math.floor(exact);
  const partials = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
  const part = partials[Math.round((exact - full) * 7)] || "";
  const filled = "█".repeat(full) + part;
  const empty = "░".repeat(Math.max(0, width - full - (part ? 1 : 0)));
  if (cfg.icons === "ascii") return "[" + "#".repeat(full).padEnd(width, ".") + "]";
  return pctColor(p)(filled) + dim(empty);
}

function fmtTokens(n) {
  if (!n && n !== 0) return "?";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(n);
}

function fmtDuration(ms) {
  if (!ms) return "0m";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h${String(m % 60).padStart(2, "0")}` : `${m}m`;
}

function fmtMoney(usd) {
  if (cfg.currency === "EUR") return (usd * cfg.usdToEur).toFixed(2) + "€";
  return "$" + usd.toFixed(2);
}

function shortPath(p) {
  if (!p) return "";
  const home = os.homedir();
  let s = p.startsWith(home) ? "~" + p.slice(home.length) : p;
  const parts = s.split(path.sep).filter(Boolean);
  if (parts.length > 3) s = "…/" + parts.slice(-2).join("/");
  return s;
}

function untilReset(resetsAt) {
  if (!resetsAt) return "";
  const t = typeof resetsAt === "number" ? (resetsAt < 1e12 ? resetsAt * 1000 : resetsAt) : Date.parse(resetsAt);
  if (!t || Number.isNaN(t)) return "";
  const diff = t - Date.now();
  if (diff <= 0) return "";
  return "↻" + fmtDuration(diff);
}

// ───────────────────────── Git (avec cache 5 s) ─────────────────────────
function git(cwd) {
  const cacheFile = path.join(os.tmpdir(), "claude-kit-git-" + Buffer.from(cwd).toString("base64url").slice(-40) + ".json");
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < 5000) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {}

  const run = (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", timeout: 800, stdio: ["ignore", "pipe", "ignore"] }).trim();
  let info = null;
  try {
    const out = run(["status", "--porcelain=v2", "--branch"]);
    info = { branch: "", ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0, conflicts: 0 };
    for (const line of out.split("\n")) {
      if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
      else if (line.startsWith("# branch.oid ") && !info.oid) info.oid = line.slice(13, 20);
      else if (line.startsWith("# branch.ab ")) {
        const [a, b] = line.slice(12).split(" ");
        info.ahead = Math.abs(+a);
        info.behind = Math.abs(+b);
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const xy = line.slice(2, 4);
        if (xy[0] !== ".") info.staged++;
        if (xy[1] !== ".") info.modified++;
      } else if (line.startsWith("u ")) info.conflicts++;
      else if (line.startsWith("? ")) info.untracked++;
    }
    if (info.branch === "(detached)") info.branch = "@" + (info.oid || "detached");
    try {
      info.stash = run(["stash", "list"]).split("\n").filter(Boolean).length;
    } catch {}
  } catch {
    info = null;
  }
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(info));
  } catch {}
  return info;
}

// ───────────────────────── Rendu ─────────────────────────
function render(input) {
  const s = cfg.show;
  const cwd = input.workspace?.current_dir || input.cwd || process.cwd();
  const l1 = [];
  const l2 = [];

  // Ligne 1 : modèle · dossier · git · lignes modifiées
  if (s.model) {
    const name = input.model?.display_name || input.model?.id || "Claude";
    l1.push(C.violet(bold(`${I.model} ${name}`)));
  }
  if (s.dir) l1.push(C.blue(`${I.dir} ${shortPath(cwd)}`));
  if (s.git) {
    const g = git(cwd);
    if (g) {
      let t = C.pink(`${I.branch} ${g.branch}`);
      const flags = [];
      if (g.conflicts) flags.push(C.red(`✖${g.conflicts}`));
      if (g.staged) flags.push(C.green(`●${g.staged}`));
      if (g.modified) flags.push(C.yellow(`✚${g.modified}`));
      if (g.untracked) flags.push(C.grey(`?${g.untracked}`));
      if (g.stash) flags.push(C.grey(`≡${g.stash}`));
      if (g.ahead) flags.push(C.cyan(`↑${g.ahead}`));
      if (g.behind) flags.push(C.orange(`↓${g.behind}`));
      if (!flags.length) flags.push(C.green("✓"));
      l1.push(t + " " + flags.join(" "));
    }
  }
  if (s.lines && input.cost) {
    const add = input.cost.total_lines_added || 0;
    const del = input.cost.total_lines_removed || 0;
    if (add || del) l1.push(C.green(`+${add}`) + " " + C.red(`-${del}`));
  }
  if (s.outputStyle && input.output_style?.name && input.output_style.name !== "default") {
    l1.push(dim(`${I.style} ${input.output_style.name}`));
  }

  // Ligne 2 : contexte · coût · durée · limites · heure
  if (s.context) {
    const cw = input.context_window || {};
    const size = cw.context_window_size || (input.exceeds_200k_tokens ? 1_000_000 : 200_000);
    let used = null;
    const u = cw.current_usage;
    if (u) used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    let pct = typeof cw.used_percentage === "number" ? cw.used_percentage : used != null ? (used / size) * 100 : null;
    if (pct != null) {
      if (used == null) used = Math.round((pct / 100) * size);
      const warn = pct >= 85 ? C.red(" ⚠ /compact") : "";
      l2.push(`${dim(I.ctx)} ${bar(pct)} ${pctColor(pct)(Math.round(pct) + "%")} ${dim(fmtTokens(used) + "/" + fmtTokens(size))}${warn}`);
    } else {
      l2.push(`${dim(I.ctx)} ${dim("contexte: —")}`);
    }
  }
  if (s.cost && input.cost) {
    const usd = input.cost.total_cost_usd || 0;
    const ms = input.cost.total_duration_ms || 0;
    const col = usd >= cfg.budgetPerSession ? C.red : usd >= cfg.budgetPerSession / 2 ? C.yellow : C.green;
    let t = col(fmtMoney(usd));
    if (ms > 5 * 60000 && usd > 0) t += dim(` (${fmtMoney(usd / (ms / 3600000))}/h)`);
    l2.push(t);
  }
  if (s.duration && input.cost?.total_duration_ms) {
    const api = input.cost.total_api_duration_ms || 0;
    const total = input.cost.total_duration_ms;
    let t = `${dim(I.time)} ${fmtDuration(total)}`;
    if (api && total) t += dim(` · api ${Math.round((api / total) * 100)}%`);
    l2.push(t);
  }
  if (s.limits && input.rate_limits) {
    const parts = [];
    const fh = input.rate_limits.five_hour;
    const sd = input.rate_limits.seven_day;
    const pctOf = (o) => (o == null ? null : o.used_percentage ?? o.utilization ?? null);
    if (pctOf(fh) != null) {
      const p = pctOf(fh);
      parts.push(`5h ${bar(p, 6)} ${pctColor(p)(Math.round(p) + "%")} ${dim(untilReset(fh.resets_at))}`);
    }
    if (pctOf(sd) != null) {
      const p = pctOf(sd);
      parts.push(`7j ${pctColor(p)(Math.round(p) + "%")}`);
    }
    if (parts.length) l2.push(`${dim(I.limit)} ` + parts.join(dim(" · ")));
  }
  if (s.clock) {
    const d = new Date();
    l2.push(dim(`${I.clock} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`));
  }

  return [l1.join(SEP), l2.join(SEP)].filter(Boolean).join("\n");
}

// ───────────────────────── Main ─────────────────────────
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  try {
    process.stdout.write(render(input));
  } catch (e) {
    process.stdout.write("claude-kit statusline: " + e.message);
  }
});
