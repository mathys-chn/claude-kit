#!/usr/bin/env node
// claude-kit · prompt-stamp — UserPromptSubmit : mémorise l'heure du prompt (sert à notify.js
// pour ne notifier que les tâches longues). N'altère jamais le prompt.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const { session_id } = JSON.parse(raw);
    fs.writeFileSync(path.join(os.tmpdir(), `claude-kit-prompt-${session_id || "x"}`), String(Date.now()));
  } catch {}
  process.exit(0);
});
