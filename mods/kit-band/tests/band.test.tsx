import { expect, mock, test } from 'claude-code/testing'

const BAND = { plugin: 'kit-band', component: 'AbovePrompt', props: { hasSurvey: false } } as const
const now = Date.parse('2026-11-02T18:00:00Z')

const CONFIG = '/home/u/.claude/claude-kit/config.json'
let files = new Map<string, string>()
let mtimes = new Map<string, number>()
let tick = 1
let dirs = new Set<string>()
let commands: string[] = []
let onOpen: (() => void) | undefined

function engine(on: Parameters<Parameters<typeof test>[1]>[1], rateLimits: unknown[], config?: unknown, ownClock = true) {
  files = new Map(config === undefined ? [] : [[CONFIG, JSON.stringify(config)]])
  mtimes = new Map(config === undefined ? [] : [[CONFIG, tick++]])
  dirs = new Set()
  commands = []
  on('fs.exists', (_, e) => {
    const path = (e as { path: string }).path
    return { value: files.has(path) || dirs.has(path) }
  })
  on('fs.stat', (_, e) => {
    const path = (e as { path: string }).path
    if (!files.has(path)) throw new Error('ENOENT')
    return { value: { kind: 'file', size: files.get(path)!.length, mtimeMs: mtimes.get(path) ?? 0, isLink: false } }
  })
  on('env.get', (_, e) => ({ value: (e as { name: string }).name === 'HOME' ? '/home/u' : undefined }))
  on('fs.read', (_, e) => {
    const path = (e as { path: string }).path
    if (!files.has(path)) throw new Error('ENOENT')
    return { value: files.get(path)! }
  })
  on('fs.write', (_, e) => {
    const { path, text } = e as { path: string; text: string }
    files.set(path, text)
    mtimes.set(path, tick++)
    return { value: undefined }
  })
  if (ownClock) {
    on('clock.now', () => ({ value: now }))
    on('clock.every', () => ({ value: undefined }))
    on('clock.sleep', () => ({ value: undefined }))
  }
  on('session.cwd', () => ({ value: '/home/u/dev/repo' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.turns', () => ({ value: 12 }))
  on('session.usage', () => ({
    value: { startedAt: now - 2 * 3600_000, context: { tokens: 870_000, window: 1_000_000, percent: 87 }, rateLimits, cost: { usd: 134.9 } },
  }))
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv.join(' ')
    commands.push(argv)
    if (argv === 'uname') return { value: { exitCode: 0, stdout: 'Darwin\n', stderr: '' } }
    if (argv.startsWith('open ')) {
      onOpen?.()
      return { value: { exitCode: 0, stdout: '', stderr: '' } }
    }
    if (argv.startsWith('date')) return { value: { exitCode: 0, stdout: '+0100\n', stderr: '' } }
    if (argv.includes('--shortstat')) return { value: { exitCode: 0, stdout: ' 3 files changed, 120 insertions(+), 30 deletions(-)\n', stderr: '' } }
    if (argv.includes('log')) return { value: { exitCode: 0, stdout: `${Math.floor((now - 3 * 3600_000) / 1000)}\n`, stderr: '' } }
    return { value: { exitCode: 0, stdout: '# branch.oid abcdef1234\n# branch.head main\n# branch.ab +2 -0\n1 .M N... 1 1 1 a a f2\n? f3\n', stderr: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'kit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
}

test('limites en 1re ligne avec projection, reset à l\'heure locale, infos git', async ($, on) => {
  mock.store(on)
  engine(on, [
    // 3 h écoulées sur 5 h, 80 % consommés → vide avant le reset
    { kind: 'five_hour', percentUsed: 80, resetsAt: new Date(now + 2 * 3600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 60, resetsAt: new Date(now + 2 * 86400_000).toISOString() },
  ], { band: { chip: 'pill' } })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Opus/ })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /^80%$/ }))?.text).toBe('80%')
    expect((await ui.find({ type: 'Text', text: /vide/ }))?.text).toBe('⚠ vide ~19:45')
    expect((await ui.find({ type: 'Text', text: /^↻ 21:00/ }))?.text).toBe('↻ 21:00 (2h00)')
    expect((await ui.find({ type: 'Text', text: /%\/j/ }))?.text).toBe('≈20%/j')
    expect((await ui.find({ type: 'Text', text: /mer\./ }))?.text).toBe('↻ mer. 19:00 (2j0h)')
    expect((await ui.find({ type: 'Text', text: /^\+120$/ }))?.text).toBe('+120')
    expect((await ui.find({ type: 'Text', text: /^commit/ }))?.text).toBe('commit 3h00')
    expect((await ui.find({ type: 'Text', text: /msg/ }))?.text).toBe('· 12 msg')
    await ui.unmount()
  }
})

test('sans lecture de l\'API, la bande le dit', async ($, on) => {
  mock.store(on)
  engine(on, [])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /prochaine réponse/ })).toBeTruthy()
  await ui.unmount()
})

const PANE = {
  plugin: 'kit-band',
  component: 'Pane',
  requestId: 'kit-band-settings',
  props: { title: 'claude-kit · Réglages', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('le panneau masque un élément, change l\'ordre et la couleur', async ($, on) => {
  mock.store(on)
  // un réglage inconnu (ajouté à la main) doit survivre aux écritures du panneau
  engine(on, [{ kind: 'five_hour', percentUsed: 40, resetsAt: new Date(now + 3 * 3600_000).toISOString() }], {
    band: { chip: 'pill', brandLabel: 'Mathys' },
    custom: { keep: true },
  })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // nom par défaut et pas de modèle
  expect(await band.find({ type: 'Svg' })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: /Opus/ })).toBeFalsy()
  expect(await band.find({ type: 'Text', text: /⎇ main/ })).toBeTruthy()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'on-git' })
  await pane.press({ key: 'on-model' })
  await pane.press({ key: 'down-brand' })
  await pane.press({ key: 'tab-look' })
  await pane.press({ key: 'preset-emeraude' })
  await new Promise(resolve => setTimeout(resolve, 30))

  // tout est écrit dans le fichier commun du kit
  const saved = JSON.parse(files.get(CONFIG)!)
  expect(saved.band.accent).toBe('#059669')
  expect(saved.band.hidden).toContain('git')
  expect(saved.band.order[1]).toBe('brand')
  expect(saved.custom.keep).toBe(true)
  expect(saved.notifications.soundName).toBe('Glass')

  const band2 = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band2.find({ type: 'Text', text: /⎇ main/ })).toBeFalsy()
  expect((await band2.find({ type: 'Text', text: /Opus/ }))?.text).toContain('Opus 5.5')
  expect((await band2.find({ type: 'Text', text: /Mathys/ }))?.text).toBe('◆ Mathys')
  await pane.unmount()
  await band.unmount()
  await band2.unmount()
})

test('les réglages enregistrés sont repris à la session suivante', async ($, on) => {
  mock.store(on)
  engine(on, [], { band: { hidden: ['ctx', 'cost', 'git', 'turn'], brandLabel: 'MCH Tech', layout: 'one', accent: '#059669' } })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /MCH Tech/ }))?.text).toBe('◆ MCH Tech')
  expect(await band.find({ type: 'Text', text: /⎇/ })).toBeFalsy()
  expect(await band.find({ type: 'Text', text: /msg/ })).toBeFalsy()
  await band.unmount()
})

test('style arrondi : une image par puce, à la hauteur d\'une ligne, texte et barre dedans', async ($, on) => {
  mock.store(on)
  engine(on, [{ kind: 'five_hour', percentUsed: 42, resetsAt: new Date(now + 2 * 3600_000).toISOString() }])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svgs = await band.findAll({ type: 'Svg' })
  const five = svgs.find(x => String(x.props.alt).startsWith('5h'))
  expect(five?.props.height).toBe(20)
  expect(String(five?.props.source)).toContain('rx="10"')
  expect(String(five?.props.source)).toContain('>42%<')
  expect(String(five?.props.alt)).toContain('↻ 21:00 (2h00)')
  const git = svgs.find(x => String(x.props.alt).startsWith('⎇ main'))
  expect(String(git?.props.source)).toContain('⎇ main')
  // aucune bordure n'est dessinée autour des puces
  expect(await band.find({ type: 'Text', text: /42%/ })).toBeFalsy()
  await band.unmount()
})

test('panneau : onglets notifications et sécurité écrivent la config des hooks', async ($, on) => {
  mock.store(on)
  engine(on, [])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await pane.press({ key: 'tab-notifications' })
  await pane.press({ key: 's-on-t' }) // son coupé
  await pane.press({ key: 'q-on-t' }) // heures calmes activées
  await pane.press({ key: 'tab-security' })
  await pane.press({ key: 'g-ask-t' }) // plus de confirmation pour les commandes risquées
  await pane.press({ key: 'tab-automation' })
  await pane.press({ key: 'f-py-t' }) // pas de Ruff
  await new Promise(resolve => setTimeout(resolve, 30))

  const saved = JSON.parse(files.get(CONFIG)!)
  expect(saved.notifications.sound).toBe(false)
  expect(saved.notifications.quietHours.enabled).toBe(true)
  expect(saved.guard.askRisky).toBe(false)
  expect(saved.guard.blockDangerous).toBe(true)
  expect(saved.format.python).toBe(false)
  expect(saved.version).toBe(2)

  // l'onglet À propos affiche le chemin du fichier
  await pane.press({ key: 'tab-about' })
  expect(await pane.find({ type: 'Text', text: /claude-kit\/config\.json/ })).toBeTruthy()
  await pane.unmount()
})

test('synchronisation : un changement fait dans un autre onglet arrive en moins de 2 s', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on, { now })
  engine(on, [], { band: { chip: 'pill', brandLabel: 'Avant' } }, false)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /Avant/ }))?.text).toBe('◆ Avant')

  // un autre onglet écrit config.json…
  files.set(CONFIG, JSON.stringify({ band: { chip: 'pill', brandLabel: 'Après', hidden: ['git'] } }))
  mtimes.set(CONFIG, tick++)
  // …et un autre reçoit de nouvelles limites
  const LIMITS = CONFIG.replace('config.json', 'limits.json')
  files.set(LIMITS, JSON.stringify({ five_hour: { kind: 'five_hour', percentUsed: 37, resetsAt: new Date(now + 3600_000).toISOString(), seenAt: now } }))
  mtimes.set(LIMITS, tick++)

  await clock.advance(2_100)
  await new Promise(resolve => setTimeout(resolve, 80))
  const band2 = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band2.find({ type: 'Text', text: /Après/ }))?.text).toBe('◆ Après')
  expect(await band2.find({ type: 'Text', text: /⎇ main/ })).toBeFalsy()
  expect((await band2.find({ type: 'Text', text: /^37%$/ }))?.text).toBe('37%')
  await band.unmount()
  await band2.unmount()
})

test('les limites reçues sont écrites dans le fichier partagé', async ($, on) => {
  mock.store(on)
  engine(on, [{ kind: 'seven_day', percentUsed: 93, resetsAt: new Date(now + 86400_000).toISOString() }])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const shared = JSON.parse(files.get(CONFIG.replace('config.json', 'limits.json'))!)
  expect(shared.seven_day.percentUsed).toBe(93)
})

test('la session publie son état pour le Stream Deck', async ($, on) => {
  mock.store(on)
  engine(on, [])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const snap = JSON.parse(files.get('/home/u/.claude/claude-kit/sessions/sess-1.json')!)
  expect(snap.project).toBe('repo')
  expect(snap.activity).toBe('idle')
  expect(snap.cost).toBe(134.9)
  expect(snap.context.percent).toBe(87)
  expect(snap.git.branch).toBe('main')
  expect(typeof snap.updatedAt).toBe('number')
})

test('onglet Stream Deck : détecte l\'app et installe le plugin en un clic', async ($, on) => {
  mock.store(on)
  engine(on, [])
  const KIT = '/home/u/.claude/claude-kit'
  const PLUGINS = '/home/u/Library/Application Support/com.elgato.StreamDeck/Plugins'
  const SD = 'io.github.mathyschn.claudekit.sdPlugin'
  // l'installeur du kit a déposé le plugin, l'app Stream Deck est installée
  files.set(`${KIT}/streamdeck/claude-kit.streamDeckPlugin`, 'zip')
  files.set(`${KIT}/streamdeck/${SD}/manifest.json`, JSON.stringify({ Version: '1.0.0.0' }))
  dirs.add('/Applications/Elgato Stream Deck.app')
  dirs.add(PLUGINS)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-streamdeck' })
  expect(await pane.find({ type: 'Text', text: /Plugin pas encore installé/ })).toBeTruthy()

  // l'app Stream Deck installera le plugin quand on ouvrira le fichier
  const done = () => {
    dirs.add(`${PLUGINS}/${SD}`)
    files.set(`${PLUGINS}/${SD}/manifest.json`, JSON.stringify({ Version: '1.0.0.0' }))
  }
  const before = commands.length
  onOpen = done
  await pane.press({ key: 'sd-install' })
  onOpen = undefined
  await new Promise(resolve => setTimeout(resolve, 80))
  expect(commands.slice(before)).toContain(`open ${KIT}/streamdeck/claude-kit.streamDeckPlugin`)
  expect(await pane.find({ type: 'Text', text: /Plugin installé · v1\.0\.0/ })).toBeTruthy()
  expect(await pane.find({ type: 'Button', key: 'sd-remove' })).toBeTruthy()

  // une nouvelle version du kit propose la mise à jour
  files.set(`${KIT}/streamdeck/${SD}/manifest.json`, JSON.stringify({ Version: '1.1.0.0' }))
  await pane.press({ key: 'sd-refresh' })
  expect(await pane.find({ type: 'Text', text: /Mise à jour disponible · v1\.0\.0 → v1\.1\.0/ })).toBeTruthy()
  await pane.unmount()
})

test('onglet Stream Deck : app absente', async ($, on) => {
  mock.store(on)
  engine(on, [])
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await new Promise(resolve => setTimeout(resolve, 80))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pane.press({ key: 'tab-streamdeck' })
  expect(await pane.find({ type: 'Text', text: /App Stream Deck non trouvée/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Elgato Stream Deck/ })).toBeTruthy()
  await pane.unmount()
})
