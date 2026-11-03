// Mise à jour automatique, testée contre un faux GitHub local.
//   node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

// Lancement asynchrone : le faux GitHub tourne dans ce processus et doit pouvoir répondre
function run(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env: options.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(options.input || "");
  });
}

const ROOT = path.join(__dirname, "..");
const { compare, notesFor } = require(path.join(ROOT, "hooks", "update.js"));
const SD = "io.github.mathyschn.claudekit.sdPlugin";

function copyTree(from, to, skip = new Set([".git", "node_modules", "tests"])) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b, skip);
    else fs.copyFileSync(a, b);
  }
}

// Une « nouvelle version » du kit publiée sur le faux GitHub, comme l'archive codeload (dossier claude-kit-main/)
function publish(tmp, version, { pluginVersion } = {}) {
  const stage = path.join(tmp, "stage");
  const src = path.join(stage, "claude-kit-main");
  copyTree(ROOT, src);
  fs.writeFileSync(path.join(src, "VERSION"), `${version}\n`);
  fs.writeFileSync(path.join(src, "CHANGELOG.md"), `# Changelog\n\n## ${version} — 2026-11-04\n\n- **Nouveau** : une super fonction.\n- Un correctif.\n\n## 3.4.0\n\n- Ancien.\n`);
  if (pluginVersion) {
    const mf = path.join(src, "streamdeck", SD, "manifest.json");
    const m = JSON.parse(fs.readFileSync(mf, "utf8"));
    m.Version = pluginVersion;
    fs.writeFileSync(mf, JSON.stringify(m, null, 2));
    fs.rmSync(path.join(src, "streamdeck", "dist"), { recursive: true, force: true }); // reconstruit par l'installeur
  }
  const tarball = path.join(tmp, "kit.tar.gz");
  const r = spawnSync("tar", ["-czf", tarball, "-C", stage, "claude-kit-main"]);
  assert.strictEqual(r.status, 0, String(r.stderr));
  return { tarball, version, changelog: fs.readFileSync(path.join(src, "CHANGELOG.md"), "utf8") };
}

function fakeGitHub(release) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/raw/VERSION") return res.end(`${release.version}\n`);
      if (req.url === "/raw/CHANGELOG.md") return res.end(release.changelog);
      if (req.url === "/archive.tar.gz") return res.end(fs.readFileSync(release.tarball));
      res.statusCode = 404;
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

function env(dir, gh, extra = {}) {
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: dir,
    CLAUDE_KIT_UPDATE_BASE: `${gh.base}/raw`,
    CLAUDE_KIT_UPDATE_ARCHIVE: `${gh.base}/archive.tar.gz`,
    ...extra,
  };
}

test("comparaison de versions et notes du CHANGELOG", () => {
  assert.ok(compare("3.4.1", "3.4.0") > 0);
  assert.ok(compare("3.10.0", "3.9.9") > 0);
  assert.strictEqual(compare("3.4.0", "3.4.0"), 0);
  assert.ok(compare("3.3.9", "3.4.0") < 0);
  assert.deepStrictEqual(notesFor("## 3.5.0 — x\n\n- **A** : b\n- `c`\n\n## 3.4.0\n- d\n", "3.5.0"), ["A : b", "c"]);
});

test("mise à jour de 3.4.0 vers 3.4.1 : réglages gardés, plugin Stream Deck remplacé", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ck-update-"));
  const dir = path.join(tmp, "claude");
  const sdDir = path.join(tmp, "streamdeck-plugins");
  fs.mkdirSync(sdDir);
  const release = publish(tmp, "3.4.1", { pluginVersion: "9.9.9.0" });
  const gh = await fakeGitHub(release);
  try {
    // installation de la version actuelle, avec le plugin Stream Deck et des réglages perso
    const inst = await run([path.join(ROOT, "install.js"), "--name=Mathys", "--auto-update", "--streamdeck"], {
      env: env(dir, gh, { STREAMDECK_PLUGINS_DIR: sdDir }),
    });
    assert.strictEqual(inst.status, 0, inst.stderr);
    const cfgPath = path.join(dir, "claude-kit", "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    assert.strictEqual(cfg.updates.mode, "auto");
    cfg.band.accent = "#059669";
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
    const before = JSON.parse(fs.readFileSync(path.join(dir, "claude-kit", "version.json"), "utf8")).version;

    // le hook de démarrage est bien déclaré
    const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    const startHooks = settings.hooks.SessionStart.flatMap((m) => m.hooks.map((h) => h.command));
    assert.ok(startHooks.some((c) => c.includes("update.js") && c.endsWith("--auto")));
    assert.ok(startHooks.some((c) => c.includes("session-start.js")));

    // vérification seule
    const check = await run([path.join(dir, "claude-kit", "hooks", "update.js"), "--check"], { env: env(dir, gh) });
    const st = JSON.parse(check.stdout);
    assert.strictEqual(st.state, "available");
    assert.strictEqual(st.current, before);
    assert.strictEqual(st.latest, "3.4.1");
    assert.deepStrictEqual(st.notes, ["Nouveau : une super fonction.", "Un correctif."]);

    // mise à jour
    const now = await run([path.join(dir, "claude-kit", "hooks", "update.js"), "--now"], {
      env: env(dir, gh, { STREAMDECK_PLUGINS_DIR: sdDir }),
    });
    const done = JSON.parse(now.stdout);
    assert.strictEqual(done.state, "installed", fs.existsSync(path.join(dir, "claude-kit", "update.log")) ? fs.readFileSync(path.join(dir, "claude-kit", "update.log"), "utf8") : "");
    assert.strictEqual(done.current, "3.4.1");
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "claude-kit", "version.json"), "utf8")).version, "3.4.1");
    const after = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    assert.strictEqual(after.band.accent, "#059669", "réglages conservés");
    assert.strictEqual(after.band.brandLabel, "Mathys", "nom conservé");
    assert.strictEqual(after.updates.mode, "auto");
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(sdDir, SD, "manifest.json"), "utf8")).Version, "9.9.9.0", "plugin Stream Deck mis à jour");
    assert.ok(!fs.existsSync(path.join(dir, "claude-kit", "update.lock")));

    // relancer : déjà à jour
    const again = JSON.parse((await run([path.join(dir, "claude-kit", "hooks", "update.js"), "--now"], { env: env(dir, gh) })).stdout);
    assert.strictEqual(again.state, "up-to-date");

    // le hook de démarrage rend la main immédiatement et ne revérifie pas avant l'intervalle
    const t0 = Date.now();
    await run([path.join(dir, "claude-kit", "hooks", "update.js"), "--auto"], { env: env(dir, gh), input: "{}" });
    assert.ok(Date.now() - t0 < 2000);
  } finally {
    gh.server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("sans réseau : état « error », rien de cassé", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ck-update-off-"));
  try {
    const e = { ...process.env, CLAUDE_CONFIG_DIR: tmp, CLAUDE_KIT_UPDATE_BASE: "http://127.0.0.1:9/raw", CLAUDE_KIT_UPDATE_ARCHIVE: "http://127.0.0.1:9/a" };
    const r = spawnSync(process.execPath, [path.join(ROOT, "hooks", "update.js"), "--now"], { env: e, encoding: "utf8" });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(JSON.parse(r.stdout).state, "error");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
