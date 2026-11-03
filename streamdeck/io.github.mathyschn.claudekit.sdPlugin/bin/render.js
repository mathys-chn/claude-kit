// Dessin des touches (SVG 144×144) : anneau, barre ou texte, aux couleurs du thème claude-kit.
"use strict";
const { HOUR, WEEK_MS } = require("./data");

const SIZE = 144;
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif";
const GREEN = "#34d399";
const YELLOW = "#fbbf24";
const ORANGE = "#fb923c";
const RED = "#fb7185";
const PINK = "#f0abfc";
const CYAN = "#67e8f9";

const PRESETS = {
  violet: ["#7c3aed", "#c4b5fd"],
  indigo: ["#4f46e5", "#a5b4fc"],
  fuchsia: ["#c026d3", "#f0abfc"],
  lavande: ["#8b5cf6", "#e9d5ff"],
  nuit: ["#2563eb", "#93c5fd"],
  rose: ["#db2777", "#fbcfe8"],
  emeraude: ["#059669", "#6ee7b7"],
  ambre: ["#d97706", "#fcd34d"],
  graphite: ["#475569", "#cbd5e1"],
};

const DEFAULT_SETTINGS = {
  style: "ring", // ring | bar | text
  value: "used", // used | remaining
  label: "",
  color: "kit", // kit | <preset> | custom
  customColor: "#7c3aed",
  background: "dark", // dark | black | accent
  alertAt: 85,
  showReset: true,
  project: "", // vide = session la plus récente
  press: "toggle", // toggle | refresh
  currency: "kit", // kit | USD | EUR
};

// ─── Couleurs ───
const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || "").trim());
  return m ? m[1] : "7c3aed";
};
const rgb = (c) => [0, 2, 4].map((i) => parseInt(hex(c).slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");

function theme(settings, config) {
  let [accent, accent2] = PRESETS.violet;
  if (settings.color === "kit" && config?.band) [accent, accent2] = [config.band.accent || accent, config.band.accent2 || accent2];
  else if (settings.color === "custom") [accent, accent2] = [`#${hex(settings.customColor)}`, mix(`#${hex(settings.customColor)}`, "#ffffff", 0.6)];
  else if (PRESETS[settings.color]) [accent, accent2] = PRESETS[settings.color];
  const bg = settings.background === "black" ? "#000000" : settings.background === "accent" ? mix("#0b0913", accent, 0.45) : mix("#0f0d18", accent, 0.14);
  return { accent, accent2, bg, text: "#f5f3ff", muted: mix("#9a95b8", accent2, 0.25), track: mix(bg, "#ffffff", 0.1) };
}

const levelColors = (p, t, alertAt) => (p < Math.min(70, alertAt) ? [t.accent, t.accent2] : p < alertAt ? ["#d97706", YELLOW] : ["#e11d48", RED]);

// ─── Formatage ───
function duration(ms) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)}j${h % 24}h`;
}
const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
function clock(ms, withDay = false) {
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return withDay ? `${DAYS[d.getDay()]} ${hm}` : hm;
}
function money(usd, settings, config) {
  const cur = settings.currency === "kit" ? config?.general?.currency || "USD" : settings.currency;
  const v = cur === "EUR" ? usd * (config?.general?.usdToEur || 0.92) : usd;
  const s = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.round(v));
  return cur === "EUR" ? `${s}€` : `$${s}`;
}
const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

// ─── Briques SVG ───
let gradientId = 0;
function frame(t, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" font-family="${FONT}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${t.bg}"/>${inner}</svg>`;
}
function text(x, y, value, { size = 14, weight = 600, color = "#fff", anchor = "middle", spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}"${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(value)}</text>`;
}
function gradient(c1, c2) {
  const id = `g${++gradientId}`;
  return { id, def: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` };
}
function ring(cx, cy, r, w, pct, colors, t, tickPct) {
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const g = gradient(colors[0], colors[1]);
  let out = g.def;
  out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.track}" stroke-width="${w}"/>`;
  if (p > 0) out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${g.id})" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${((p / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  if (tickPct !== undefined) {
    const a = ((tickPct / 100) * 360 - 90) * (Math.PI / 180);
    const x1 = cx + (r - w / 2 - 1) * Math.cos(a), y1 = cy + (r - w / 2 - 1) * Math.sin(a);
    const x2 = cx + (r + w / 2 + 1) * Math.cos(a), y2 = cy + (r + w / 2 + 1) * Math.sin(a);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  return out;
}
function bar(x, y, w, h, pct, colors, t, tickPct) {
  const p = Math.max(0, Math.min(100, pct));
  const g = gradient(colors[0], colors[1]);
  let out = g.def + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${t.track}"/>`;
  if (p > 0) out += `<rect x="${x}" y="${y}" width="${Math.max(h, (p / 100) * w).toFixed(1)}" height="${h}" rx="${h / 2}" fill="url(#${g.id})"/>`;
  if (tickPct !== undefined) out += `<rect x="${(x + (tickPct / 100) * w - 1.25).toFixed(1)}" y="${y - 3}" width="2.5" height="${h + 6}" rx="1.25" fill="#fff"/>`;
  return out;
}
function percentText(cx, y, value, size, color) {
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-weight="800" fill="${color}"><tspan font-size="${size}">${Math.round(value)}</tspan><tspan font-size="${Math.round(size * 0.5)}" dx="1">%</tspan></text>`;
}

// Message quand il n'y a rien à afficher
function empty(t, label, hint) {
  return frame(t, text(72, 66, "—", { size: 38, weight: 700, color: t.muted }) + text(72, 98, label, { size: 15, weight: 700, color: t.accent2, spacing: 1 }) + text(72, 126, hint, { size: 12, weight: 500, color: t.muted }));
}

// ─── Touches ───
function limitKey(kind, snap, s, alt) {
  const t = theme(s, snap.config);
  const l = snap.limits[kind];
  const defaults = { session: "5 H", week: "SEMAINE", spend: "BUDGET" };
  const label = s.label || defaults[kind];
  if (!l) return empty(t, label, "après 1 réponse");
  const isWeek = kind === "week";
  const shown = s.value === "remaining" ? 100 - l.percent : l.percent;
  const colors = levelColors(l.percent, t, s.alertAt);
  const pctColor = l.percent >= s.alertAt ? RED : t.text;

  // Ligne du bas : projection si la limite sera atteinte avant le reset, sinon l'heure du reset
  let bottom = "";
  let bottomColor = t.muted;
  if (l.emptyAtMs) {
    // jour affiché si la projection ne tombe pas aujourd'hui
    const sameDay = new Date(l.emptyAtMs).toDateString() === new Date(snap.now).toDateString();
    bottom = `⚠ vide ${clock(l.emptyAtMs, !sameDay)}`;
    bottomColor = l.emptyInMs < HOUR ? RED : ORANGE;
  } else if (s.showReset && l.resetsAtMs) bottom = `↻ ${clock(l.resetsAtMs, isWeek)}`;
  else if (l.isReset) [bottom, bottomColor] = ["réinitialisé", GREEN];

  if (alt) {
    // Vue détaillée (appui sur la touche) : reset, rythme, % par jour
    const lines = [];
    if (l.resetsAtMs) lines.push([`↻ ${clock(l.resetsAtMs, isWeek)}`, t.text, 20]);
    if (l.resetsInMs) lines.push([`dans ${duration(l.resetsInMs)}`, t.muted, 15]);
    if (l.pace !== undefined) lines.push([`rythme ${l.pace >= 0 ? "+" : ""}${Math.round(l.pace)}%`, l.pace >= 0 ? GREEN : l.pace > -10 ? YELLOW : RED, 15]);
    if (l.perDay !== undefined) lines.push([`≈${Math.round(l.perDay)}%/jour`, t.muted, 15]);
    let y = 30;
    let inner = text(72, y, label, { size: 14, weight: 800, color: t.accent2, spacing: 1 });
    for (const [v, c, size] of lines) {
      y += size + 10;
      inner += text(72, y, v, { size, weight: size > 16 ? 800 : 600, color: c });
    }
    return frame(t, inner);
  }

  if (s.style === "bar") {
    return frame(t,
      text(14, 30, label, { size: 15, weight: 800, color: t.accent2, anchor: "start", spacing: 1 }) +
      percentText(72, 82, shown, 44, pctColor) +
      bar(14, 96, 116, 10, l.percent, colors, t, l.timePct) +
      text(72, 130, bottom, { size: 14, weight: 600, color: bottomColor }));
  }
  if (s.style === "text") {
    return frame(t,
      percentText(72, 78, shown, 52, pctColor) +
      text(72, 104, label, { size: 15, weight: 800, color: t.accent2, spacing: 1 }) +
      text(72, 130, bottom, { size: 14, weight: 600, color: bottomColor }));
  }
  return frame(t,
    ring(72, 62, 46, 10, l.percent, colors, t, l.timePct) +
    percentText(72, 70, shown, 32, pctColor) +
    text(72, 88, label, { size: 11, weight: 800, color: t.accent2, spacing: 1 }) +
    text(72, 132, bottom, { size: 14, weight: 600, color: bottomColor }));
}

function contextKey(snap, s, alt) {
  const t = theme(s, snap.config);
  const label = s.label || "CONTEXTE";
  const c = snap.session?.context;
  if (!c) return empty(t, label, "ouvre Claude");
  const used = c.tokens ?? Math.round((c.percent / 100) * c.window);
  const shown = s.value === "remaining" ? 100 - c.percent : c.percent;
  const colors = levelColors(c.percent, t, s.alertAt);
  const pctColor = c.percent >= s.alertAt ? RED : t.text;
  const bottom = c.percent >= 80 ? "⚠ /compact" : `${tokens(used)} / ${tokens(c.window)}`;
  const bottomColor = c.percent >= 80 ? ORANGE : t.muted;
  if (alt) {
    return frame(t,
      text(72, 30, label, { size: 14, weight: 800, color: t.accent2, spacing: 1 }) +
      text(72, 66, tokens(used), { size: 34, weight: 800, color: t.text }) +
      text(72, 88, `sur ${tokens(c.window)}`, { size: 15, weight: 600, color: t.muted }) +
      text(72, 124, clip(snap.session.project, 14), { size: 14, weight: 600, color: t.muted }));
  }
  if (s.style === "bar") {
    return frame(t,
      text(14, 30, label, { size: 15, weight: 800, color: t.accent2, anchor: "start", spacing: 1 }) +
      percentText(72, 82, shown, 44, pctColor) +
      bar(14, 96, 116, 10, c.percent, colors, t) +
      text(72, 130, bottom, { size: 14, weight: 600, color: bottomColor }));
  }
  if (s.style === "text") {
    return frame(t,
      percentText(72, 78, shown, 52, pctColor) +
      text(72, 104, label, { size: 15, weight: 800, color: t.accent2, spacing: 1 }) +
      text(72, 130, bottom, { size: 14, weight: 600, color: bottomColor }));
  }
  return frame(t,
    ring(72, 62, 46, 10, c.percent, colors, t) +
    percentText(72, 70, shown, 32, pctColor) +
    text(72, 88, s.label || "CTX", { size: 11, weight: 800, color: t.accent2, spacing: 1 }) +
    text(72, 132, bottom, { size: 14, weight: 600, color: bottomColor }));
}

function costKey(snap, s, alt) {
  const t = theme(s, snap.config);
  const label = s.label || "SESSION";
  const ss = snap.session;
  if (!ss) return empty(t, label, "ouvre Claude");
  const perHour = ss.elapsedMs > 10 * 60_000 && ss.cost > 0 ? ss.cost / (ss.elapsedMs / HOUR) : null;
  const big = money(ss.cost, s, snap.config);
  const size = big.length > 6 ? 30 : big.length > 4 ? 36 : 42;
  if (alt) {
    const perMsg = ss.turns > 0 ? money(ss.cost / ss.turns, s, snap.config) : "—";
    return frame(t,
      text(72, 30, label, { size: 14, weight: 800, color: t.accent2, spacing: 1 }) +
      text(72, 66, `${ss.turns} msg`, { size: 28, weight: 800, color: t.text }) +
      text(72, 92, `${perMsg} / msg`, { size: 15, weight: 600, color: t.muted }) +
      text(72, 124, clip(ss.project, 14), { size: 14, weight: 600, color: t.muted }));
  }
  return frame(t,
    text(72, 30, label, { size: 14, weight: 800, color: t.accent2, spacing: 1 }) +
    text(72, 76, big, { size, weight: 800, color: t.text }) +
    text(72, 102, perHour ? `${money(perHour, s, snap.config)}/h` : " ", { size: 16, weight: 600, color: t.muted }) +
    text(72, 130, `⏱ ${duration(ss.elapsedMs)}`, { size: 15, weight: 600, color: t.muted }));
}

function gitKey(snap, s, alt) {
  const t = theme(s, snap.config);
  const g = snap.session?.git;
  if (!g) return empty(t, s.label || "GIT", "pas de dépôt");
  const flags = [];
  if (g.conflicts) flags.push([`✖${g.conflicts}`, RED]);
  if (g.staged) flags.push([`●${g.staged}`, GREEN]);
  if (g.modified) flags.push([`✚${g.modified}`, YELLOW]);
  if (g.untracked) flags.push([`?${g.untracked}`, t.muted]);
  if (g.ahead) flags.push([`↑${g.ahead}`, CYAN]);
  if (g.behind) flags.push([`↓${g.behind}`, ORANGE]);
  if (!flags.length) flags.push(["✓ propre", GREEN]);
  const flagsSvg = `<text x="72" y="74" text-anchor="middle" font-size="18" font-weight="700">${flags.map(([v, c], i) => `<tspan fill="${c}"${i ? ' dx="6"' : ""}>${esc(v)}</tspan>`).join("")}</text>`;
  const late = g.lastCommitAgeMs > 2 * HOUR && g.added + g.removed > 0;
  if (alt) {
    return frame(t,
      text(72, 30, s.label || "GIT", { size: 14, weight: 800, color: t.accent2, spacing: 1 }) +
      text(72, 66, g.lastCommitAgeMs !== undefined ? duration(g.lastCommitAgeMs) : "—", { size: 30, weight: 800, color: late ? ORANGE : t.text }) +
      text(72, 90, "depuis le commit", { size: 13, weight: 600, color: t.muted }) +
      text(72, 124, clip(snap.session.project, 14), { size: 14, weight: 600, color: t.muted }));
  }
  return frame(t,
    text(72, 34, `⎇ ${clip(g.branch, 11)}`, { size: 17, weight: 800, color: PINK }) +
    flagsSvg +
    `<text x="72" y="104" text-anchor="middle" font-size="16" font-weight="700"><tspan fill="${GREEN}">+${g.added}</tspan><tspan fill="${RED}" dx="8">−${g.removed}</tspan></text>` +
    text(72, 130, g.lastCommitAgeMs !== undefined ? `commit ${duration(g.lastCommitAgeMs)}` : "", { size: 13, weight: 600, color: late ? ORANGE : t.muted }));
}

const SPINNER = ["◐", "◓", "◑", "◒"];
function statusKey(snap, s, alt, frameIndex = 0) {
  const t = theme(s, snap.config);
  const ss = snap.session;
  if (!ss) return empty(t, s.label || "CLAUDE", "ouvre Claude");
  const age = snap.now - ss.updatedAt;
  const since = ss.activitySince ? snap.now - ss.activitySince : 0;
  let icon, title, color;
  const chrono = (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return sec < 3600 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : duration(ms);
  };
  if (ss.activity === "working" && age < 15 * 60_000) [icon, title, color] = [SPINNER[frameIndex % 4], chrono(since), t.accent2];
  else if (age > 30 * 60_000) [icon, title, color] = ["☾", "Inactif", t.muted];
  else [icon, title, color] = ["✓", "Prêt", GREEN];
  const sub = ss.activity === "working" && age < 15 * 60_000 ? "réfléchit…" : ss.lastTurn ? `${duration(ss.lastTurn.seconds * 1000) === "0m" ? ss.lastTurn.seconds + "s" : duration(ss.lastTurn.seconds * 1000)} · ${ss.lastTurn.tools} outil${ss.lastTurn.tools > 1 ? "s" : ""}` : " ";
  if (alt) {
    const others = snap.sessions.length - 1;
    return frame(t,
      text(72, 30, s.label || "CLAUDE", { size: 14, weight: 800, color: t.accent2, spacing: 1 }) +
      text(72, 64, clip(ss.project, 12), { size: 20, weight: 800, color: t.text }) +
      text(72, 88, ss.model || "", { size: 14, weight: 600, color: t.muted }) +
      text(72, 124, others > 0 ? `+${others} autre${others > 1 ? "s" : ""} session${others > 1 ? "s" : ""}` : "1 session", { size: 13, weight: 600, color: t.muted }));
  }
  return frame(t,
    text(72, 28, clip(s.label || ss.project, 13), { size: 14, weight: 800, color: t.accent2 }) +
    text(72, 76, icon, { size: 40, weight: 700, color }) +
    text(72, 106, title, { size: 20, weight: 800, color: t.text }) +
    text(72, 130, sub, { size: 13, weight: 600, color: t.muted }));
}

function overviewKey(snap, s) {
  const t = theme(s, snap.config);
  const rows = [
    ["5h", snap.limits.session?.percent, snap.limits.session?.timePct],
    ["7j", snap.limits.week?.percent, snap.limits.week?.timePct],
    ["ctx", snap.session?.context?.percent, undefined],
  ];
  let inner = "";
  rows.forEach(([name, pct, tick], i) => {
    const y = 34 + i * 40;
    inner += text(12, y, name, { size: 14, weight: 800, color: t.accent2, anchor: "start" });
    inner += text(132, y, pct === undefined ? "—" : `${Math.round(s.value === "remaining" ? 100 - pct : pct)}%`, { size: 15, weight: 800, color: pct >= s.alertAt ? RED : t.text, anchor: "end" });
    inner += bar(12, y + 8, 120, 7, pct ?? 0, levelColors(pct ?? 0, t, s.alertAt), t, tick);
  });
  return frame(t, inner);
}

const ACTIONS = {
  limit5h: (snap, s, alt) => limitKey("session", snap, s, alt),
  limitWeek: (snap, s, alt) => limitKey("week", snap, s, alt),
  limitSpend: (snap, s, alt) => limitKey("spend", snap, s, alt),
  context: contextKey,
  cost: costKey,
  git: gitKey,
  status: statusKey,
  overview: overviewKey,
};

// Stream Deck n'accepte que des identifiants en minuscules (« limitweek ») :
// on retrouve l'action sans tenir compte de la casse.
const ACTION_BY_LOWER = Object.fromEntries(Object.keys(ACTIONS).map((k) => [k.toLowerCase(), k]));
const resolveAction = (uuid) => ACTION_BY_LOWER[String(uuid).split(".").pop().toLowerCase()] || "overview";

function renderKey(action, snap, settings, alt = false, frameIndex = 0) {
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  s.alertAt = Number(s.alertAt) || 85;
  const draw = ACTIONS[resolveAction(action)];
  return draw(snap, s, alt, frameIndex);
}

const toDataUrl = (svg) => `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;

module.exports = { renderKey, resolveAction, toDataUrl, DEFAULT_SETTINGS, PRESETS, ACTIONS };
