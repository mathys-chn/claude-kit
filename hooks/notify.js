#!/usr/bin/env node
// claude-kit · notify — notification système quand Claude a fini (Stop) ou attend ton accord (Notification).
// macOS (osascript + afplay), Linux (notify-send + paplay), Windows/WSL (toast PowerShell).
// Réglages : section « notifications » de config.json (panneau /kit → Notifications).
// Coupure ponctuelle : CLAUDE_KIT_NOTIFY=0
"use strict";
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const config = require("./lib/config");

const cfg = config.load().notifications;
if (process.env.CLAUDE_KIT_NOTIFY === "0" || !cfg.enabled) process.exit(0);

function inQuietHours(q, now = new Date()) {
  if (!q || !q.enabled) return false;
  const h = now.getHours();
  return q.start <= q.end ? h >= q.start && h < q.end : h >= q.start || h < q.end;
}

const MAC_SOUNDS = ["Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero", "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink"];

function playSound(name) {
  const opts = { stdio: "ignore", detached: true };
  try {
    if (process.platform === "darwin") {
      const file = `/System/Library/Sounds/${MAC_SOUNDS.includes(name) ? name : "Glass"}.aiff`;
      spawn("afplay", [file], opts).unref();
    } else if (process.platform === "linux") {
      const file = "/usr/share/sounds/freedesktop/stereo/complete.oga";
      if (fs.existsSync(file)) spawn("paplay", [file], opts).unref();
    }
  } catch {}
}

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  const event = input.hook_event_name || process.argv[2] || "Stop";
  if (event === "Stop" && !cfg.onStop) process.exit(0);
  if (event === "Notification" && !cfg.onPermission) process.exit(0);
  if (inQuietHours(cfg.quietHours)) process.exit(0);

  // Pas de notif « terminé » pour les tâches courtes
  if (event === "Stop" && cfg.minDurationSec > 0) {
    const stamp = path.join(os.tmpdir(), `claude-kit-prompt-${input.session_id || "x"}`);
    try {
      const started = +fs.readFileSync(stamp, "utf8");
      if (Date.now() - started < cfg.minDurationSec * 1000) process.exit(0);
    } catch {}
  }

  const project = path.basename(input.cwd || process.cwd());
  const title = event === "Stop" ? `✅ Claude a terminé — ${project}` : `🔔 Claude t'attend — ${project}`;
  const body = (input.message || (event === "Stop" ? "La tâche est terminée." : "Une action demande ton accord.")).slice(0, 180);

  const esc = (s) => s.replace(/["\\]/g, "\\$&");
  const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "''");
  const opts = { stdio: "ignore", detached: true };
  try {
    if (process.platform === "darwin") {
      spawn("osascript", ["-e", `display notification "${esc(body)}" with title "${esc(title)}"`], opts).unref();
      if (cfg.sound) playSound(cfg.soundName);
    } else if (process.platform === "win32" || fs.existsSync("/proc/sys/fs/binfmt_misc/WSLInterop")) {
      const audio = cfg.sound ? "" : "<audio silent='true'/>";
      const ps =
        `[void][Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime];` +
        `[void][Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime];` +
        `$x=New-Object Windows.Data.Xml.Dom.XmlDocument;` +
        `$x.LoadXml('<toast><visual><binding template=''ToastGeneric''><text>${xml(title)}</text><text>${xml(body)}</text></binding></visual>${audio}</toast>');` +
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
      spawn("powershell.exe", ["-NoProfile", "-Command", ps], opts).unref();
    } else {
      spawn("notify-send", ["-a", "Claude Code", title, body], opts).unref();
      if (cfg.sound) playSound(cfg.soundName);
    }
  } catch {}
  process.exit(0);
});

