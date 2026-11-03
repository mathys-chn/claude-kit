import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionRateLimit, SessionUsage } from 'claude-code'

import type { ElementId, Git, KitConfig, Limit, Settings, StreamDeckState, Tab, Turn, UpdateState, Usage } from '../types'

// ─── Thème (violet par défaut, réglable) ───
// Couleurs sémantiques : elles restent lisibles sur les puces violet sombre
const GREEN = '#34d399'
const YELLOW = '#fbbf24'
const ORANGE = '#fb923c'
const RED = '#fb7185'
const PINK = '#f0abfc'
const CYAN = '#67e8f9'
const TRACK = '#ffffff'

type Theme = {
  accent: string // violet principal
  accent2: string // violet clair (dégradés, libellés)
  chipBg: string // fond des puces
  chipBorder: string
  chipHover: string
  text: string
  muted: string
}

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  return m ? m[1]! : '8b5cf6'
}
const rgb = (c: string) => {
  const h = hex(c)
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}
const toHex = (r: number[]) => `#${r.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a)
  const y = rgb(b)
  return toHex(x.map((v, i) => v + (y[i]! - v) * t))
}

function makeTheme(accent: string, accent2: string): Theme {
  const a = `#${hex(accent)}`
  const a2 = `#${hex(accent2)}`
  return {
    accent: a,
    accent2: a2,
    chipBg: mix('#14111f', a, 0.16),
    chipBorder: mix('#14111f', a, 0.45),
    chipHover: a2,
    text: '#f5f3ff',
    muted: mix('#a8a3c4', a2, 0.25),
  }
}

const HOUR = 3_600_000
const SESSION_MS = 5 * HOUR
const WEEK_MS = 7 * 24 * HOUR
const STORE_KEY = 'limits'
const STALE_MS = 10 * 60_000

const usageAtom = atom({ plugin: 'kit-band', key: 'usage' } as const, null)
const turnAtom = atom({ plugin: 'kit-band', key: 'lastTurn' } as const, null)
const configAtom = atom({ plugin: 'kit-band', key: 'config' } as const, null)
const configPathAtom = atom({ plugin: 'kit-band', key: 'configPath' } as const, '')
const tabAtom = atom({ plugin: 'kit-band', key: 'tab' } as const, 'band')
const hexDraftAtom = atom({ plugin: 'kit-band', key: 'hexDraft' } as const, '')
const sdAtom = atom({ plugin: 'kit-band', key: 'sd' } as const, null)
const updateAtom = atom({ plugin: 'kit-band', key: 'update' } as const, null)

const PANE_ID = 'kit-band-settings'
const REFRESH_MS = 20_000
const WATCH_MS = 2_000
const REPO_URL = 'https://github.com/mathys-chn/claude-kit'

const ELEMENTS: Record<ElementId, string> = {
  brand: 'Nom',
  'five-hour': 'Limite 5 h',
  week: 'Limite semaine',
  spend: 'Budget mensuel',
  ctx: 'Contexte',
  cost: 'Coût & durée',
  git: 'Git',
  turn: 'Dernier tour',
  model: 'Modèle',
}
const ELEMENT_HINTS: Record<ElementId, string> = {
  brand: 'Ton nom ou celui de ton équipe, en pastille',
  'five-hour': 'Utilisation de la fenêtre de 5 h, rythme et reset',
  week: 'Utilisation hebdomadaire et % disponible par jour',
  spend: 'Budget mensuel, si ton compte en a un',
  ctx: 'Remplissage du contexte, bouton /compact à 80 %',
  cost: 'Coût de la session, coût par heure, durée',
  git: 'Branche, fichiers modifiés, lignes, dernier commit',
  turn: 'Durée et outils du dernier tour',
  model: 'Modèle actif',
}
const ALL_IDS = Object.keys(ELEMENTS) as ElementId[]
const LIMIT_IDS: ElementId[] = ['brand', 'five-hour', 'week', 'spend']

const PRESETS: { id: string; name: string; accent: string; accent2: string }[] = [
  { id: 'violet', name: 'Violet', accent: '#7c3aed', accent2: '#c4b5fd' },
  { id: 'indigo', name: 'Indigo', accent: '#4f46e5', accent2: '#a5b4fc' },
  { id: 'fuchsia', name: 'Fuchsia', accent: '#c026d3', accent2: '#f0abfc' },
  { id: 'lavande', name: 'Lavande', accent: '#8b5cf6', accent2: '#e9d5ff' },
  { id: 'nuit', name: 'Bleu nuit', accent: '#2563eb', accent2: '#93c5fd' },
  { id: 'rose', name: 'Rose', accent: '#db2777', accent2: '#fbcfe8' },
  { id: 'emeraude', name: 'Émeraude', accent: '#059669', accent2: '#6ee7b7' },
  { id: 'ambre', name: 'Ambre', accent: '#d97706', accent2: '#fcd34d' },
  { id: 'graphite', name: 'Graphite', accent: '#475569', accent2: '#cbd5e1' },
]

const SOUNDS = ['Glass', 'Ping', 'Pop', 'Hero', 'Tink', 'Purr', 'Submarine', 'Funk', 'Bottle', 'Frog']

// Mêmes valeurs par défaut que hooks/lib/config.js (le fichier commun du kit)
const DEFAULT_CONFIG: KitConfig = {
  version: 2,
  general: { currency: 'USD', usdToEur: 0.92, budgetPerSession: 5 },
  band: {
    order: ['brand', 'five-hour', 'week', 'spend', 'ctx', 'cost', 'git', 'turn', 'model'],
    hidden: ['model'],
    layout: 'two',
    chip: 'round',
    preset: 'violet',
    accent: '#7c3aed',
    accent2: '#c4b5fd',
    brandLabel: '',
    showPace: true,
    showResetClock: true,
  },
  notifications: {
    enabled: true,
    onStop: true,
    onPermission: true,
    minDurationSec: 20,
    sound: true,
    soundName: 'Glass',
    quietHours: { enabled: false, start: 22, end: 8 },
  },
  guard: { enabled: true, blockDangerous: true, askRisky: true, protectSecrets: true, log: true },
  format: { enabled: true, web: true, python: true, go: true, rust: true },
  sessionContext: { enabled: true, commits: 5 },
  streamdeck: { publish: true },
  updates: { mode: 'notify', repo: 'mathys-chn/claude-kit', branch: 'main', intervalHours: 6, streamdeck: true },
  statusline: {
    icons: 'unicode',
    barWidth: 10,
    show: { model: true, dir: true, git: true, lines: true, context: true, cost: true, duration: true, limits: true, clock: true, outputStyle: true },
  },
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

// Fusion profonde : garde les clés inconnues (réglages ajoutés à la main ou par une version future)
function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(over) || !isObj(base)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = isObj(b) && isObj(v) ? deepMerge(b, v) : v
  }
  return out as T
}

// Remet d'aplomb la section « band » (champ manquant, valeur invalide, élément ajouté par une mise à jour…)
function normalizeBand(raw: unknown): Settings {
  const r = (isObj(raw) ? raw : {}) as Partial<Settings>
  const d = DEFAULT_CONFIG.band
  const order = Array.isArray(r.order) ? r.order.filter((id): id is ElementId => ALL_IDS.includes(id as ElementId)) : [...d.order]
  for (const id of ALL_IDS) if (!order.includes(id)) order.push(id)
  return {
    order: [...new Set(order)],
    hidden: Array.isArray(r.hidden) ? r.hidden.filter((id): id is ElementId => ALL_IDS.includes(id as ElementId)) : [...d.hidden],
    layout: r.layout === 'one' || r.layout === 'two' ? r.layout : d.layout,
    chip: r.chip === 'round' || r.chip === 'pill' || r.chip === 'outline' || r.chip === 'plain' ? r.chip : d.chip,
    preset: typeof r.preset === 'string' ? r.preset : d.preset,
    accent: isHex(r.accent) ? r.accent : d.accent,
    accent2: isHex(r.accent2) ? r.accent2 : d.accent2,
    brandLabel: typeof r.brandLabel === 'string' ? r.brandLabel.slice(0, 16) : d.brandLabel,
    showPace: typeof r.showPace === 'boolean' ? r.showPace : d.showPace,
    showResetClock: typeof r.showResetClock === 'boolean' ? r.showResetClock : d.showResetClock,
  }
}

function normalizeConfig(raw: unknown): KitConfig {
  const merged = deepMerge(DEFAULT_CONFIG, raw)
  return { ...merged, version: 2, band: normalizeBand(merged.band), general: { ...merged.general, currency: merged.general.currency === 'EUR' ? 'EUR' : 'USD' } }
}

// <CLAUDE_CONFIG_DIR ou ~/.claude>/claude-kit/config.json — le même fichier que les hooks
async function resolveConfigPath($: EngineInterface) {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  const base = custom && custom.trim() ? custom.trim() : `${home.replace(/[\\/]+$/, '')}/.claude`
  return `${base.replace(/\\/g, '/')}/claude-kit/config.json`
}

async function limitsPath($: EngineInterface) {
  const configPath = (await read($, configPathAtom)) || (await resolveConfigPath($))
  return configPath.replace(/config\.json$/, 'limits.json')
}

// Date de modification d'un fichier (0 s'il n'existe pas) : sert à voir qu'un autre onglet a changé quelque chose
const mtimeOf = ($: EngineInterface, path: string) =>
  $.fs.stat(path).then(st => st.mtimeMs, () => 0)

async function loadConfig($: EngineInterface) {
  let configPath = await read($, configPathAtom)
  if (!configPath) {
    configPath = await resolveConfigPath($)
    await update($, configPathAtom, () => configPath)
  }
  let raw: unknown = {}
  try {
    raw = JSON.parse(String(await $.fs.read(configPath)))
  } catch {
    // fichier absent ou illisible : valeurs par défaut
  }
  const config = normalizeConfig(raw)
  await update($, configAtom, () => config)
  return config
}

async function changeConfig($: EngineInterface, fn: (c: KitConfig) => KitConfig) {
  const current = normalizeConfig(await read($, configAtom))
  const next = normalizeConfig(fn(current))
  await update($, configAtom, () => next)
  const configPath = (await read($, configPathAtom)) || (await resolveConfigPath($))
  try {
    await $.fs.write(configPath, `${JSON.stringify(next, null, 2)}\n`)
  } catch (err) {
    $.ui.toast(`kit-band : impossible d'enregistrer ${configPath}`)
  }
}

const changeBand = ($: EngineInterface, fn: (b: Settings) => Settings) => changeConfig($, c => ({ ...c, band: fn(c.band) }))

// Dernières lectures connues, gardées d'une session à l'autre
type StoredLimit = { kind: string; percentUsed: number; resetsAt?: string; seenAt: number }

// ─── Formatage ───
const levelColor = (p: number, t?: Theme) => (p < 70 ? (t ? t.accent2 : GREEN) : p < 85 ? YELLOW : p < 90 ? ORANGE : RED)
const paceColor = (pace: number) => (pace >= 0 ? GREEN : pace > -10 ? YELLOW : RED)
const formatPace = (pace: number) => `${pace >= 0 ? '+' : ''}${Math.round(pace)}%`
const formatTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`
  return `${Math.floor(hours / 24)}j${hours % 24}h`
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

// Heure locale de l'utilisateur, à partir du décalage lu sur sa machine
function formatClock(atMs: number, tzOffsetMin: number | undefined, withDay = false) {
  if (tzOffsetMin === undefined) return undefined
  const d = new Date(atMs + tzOffsetMin * 60_000)
  const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  return withDay ? `${DAYS[d.getUTCDay()]} ${hhmm}` : hhmm
}

function formatMoney(usd: number, currency: KitConfig['general']['currency'], rate = 0.92) {
  const v = currency === 'EUR' ? usd * rate : usd
  const s = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toString()
  return currency === 'EUR' ? `${s}€` : `$${s}`
}

function prettyModel(id: string) {
  const m = /(opus|sonnet|haiku|fable)[-_ ]?(\d+)(?:[-_.](\d+))?/i.exec(id)
  if (!m) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  const name = m[1]!
  return `${name[0]!.toUpperCase()}${name.slice(1).toLowerCase()} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

const textBar = (p: number, width = 6) => {
  const filled = Math.max(0, Math.min(width, Math.round((p / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const BAR_W = 60
const BAR_H = 8
// Barre : dégradé violet tant que tout va bien, ambre puis rose quand ça chauffe
function barSvg(p: number, t: Theme, timePct?: number) {
  const filled = Math.max(0, Math.min(BAR_W, Math.round((p / 100) * BAR_W)))
  const [c1, c2] = p < 70 ? [t.accent, t.accent2] : p < 85 ? ['#d97706', YELLOW] : ['#e11d48', RED]
  // petit trait = où tu « devrais » être si tu consommais au rythme du temps écoulé
  const tick = timePct === undefined ? '' : `<rect x="${Math.max(0, Math.min(BAR_W - 2, (timePct / 100) * BAR_W - 1))}" y="0" width="2" height="${BAR_H}" rx="1" fill="#ffffff" fill-opacity="0.9"/>`
  const gid = `mchb${c1.slice(1)}${c2.slice(1)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_W}" height="${BAR_H}" viewBox="0 0 ${BAR_W} ${BAR_H}"><defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect y="2" width="${BAR_W}" height="4" rx="2" fill="${TRACK}" fill-opacity="0.12"/><rect y="2" width="${filled}" height="4" rx="2" fill="url(#${gid})"/>${tick}</svg>`
}

const PILL_W = 104
const PILL_H = 14
function contextSvg(c: NonNullable<Usage['context']>, t: Theme) {
  const filled = Math.max(0, Math.min(PILL_W, Math.round((c.percent / 100) * PILL_W)))
  const tokens = c.tokens ?? Math.round((c.percent / 100) * c.window)
  const label = `ctx ${formatTokens(tokens)}/${formatTokens(c.window)} · ${Math.round(c.percent)}%`
  const [c1, c2] = c.percent < 70 ? [t.accent, t.accent2] : c.percent < 85 ? ['#d97706', YELLOW] : ['#e11d48', RED]
  const gid = `mchc${c1.slice(1)}${c2.slice(1)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PILL_W}" height="${PILL_H}" viewBox="0 0 ${PILL_W} ${PILL_H}"><defs><clipPath id="${gid}k"><rect width="${PILL_W}" height="${PILL_H}" rx="${PILL_H / 2}"/></clipPath><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><g clip-path="url(#${gid}k)"><rect width="${PILL_W}" height="${PILL_H}" fill="${mix('#14111f', t.accent, 0.3)}"/><rect width="${filled}" height="${PILL_H}" fill="url(#${gid})"/></g><text x="${PILL_W / 2}" y="10.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif" font-size="9.5" font-weight="700" fill="#ffffff" stroke="#1e1236" stroke-opacity="0.55" stroke-width="2.2" paint-order="stroke">${label}</text></svg>`
}

// Pastille du nom : arrondie, en dégradé
const brandWidth = (label: string) => 14 + Math.max(1, label.length) * 7
function brandSvg(label: string, t: Theme) {
  const text = label.replace(/[<>&"]/g, '')
  const w = brandWidth(label)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="16" viewBox="0 0 ${w} 16"><defs><linearGradient id="mchbrand${hex(t.accent)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.accent2}"/></linearGradient></defs><rect width="${w}" height="16" rx="8" fill="url(#mchbrand${hex(t.accent)})"/><text x="${w / 2}" y="11.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif" font-size="10" font-weight="800" letter-spacing="0.3" fill="#ffffff">${text}</text></svg>`
}

// ─── Puce « Arrondi » : fond aux bords ronds + texte, en une seule image ───
// Une boîte ne sait pas arrondir un fond sans ajouter une bordure (qui l'épaissit) :
// on dessine donc la puce entière, à la hauteur d'une ligne de texte.
const ROUND_H = 20
const FONT_SIZE = 12.5
const SEG_GAP = 6
const PAD_X = 9

// Largeurs approximatives (en em) de la police système, pour placer chaque segment
function textWidth(text: string, bold = false) {
  let em = 0
  for (const ch of text) {
    if (ch === ' ') em += 0.27
    else if (/[il.,:;'|!·]/.test(ch)) em += 0.27
    else if (/[fjrt()\[\]\/-]/.test(ch)) em += 0.38
    else if (/[0-9]/.test(ch)) em += 0.6
    else if (/[mwMW%]/.test(ch)) em += 0.86
    else if (/[A-Z]/.test(ch)) em += 0.66
    else if (/[a-zàâçéèêëîïôûùüÿœ]/.test(ch)) em += 0.54
    else em += 0.78 // symboles : ↻ ⏱ ⎇ ✚ ● ↑ ↓ ⚠ ≈ − + € $ ?
  }
  return em * FONT_SIZE * (bold ? 1.1 : 1.03)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type RoundSeg = { text?: string; color: string; bold?: boolean; bar?: { pct: number; timePct?: number } }

function roundChipSvg(segs: RoundSeg[], bg: string, t: Theme) {
  let x = PAD_X
  const parts: string[] = []
  segs.forEach((s, i) => {
    if (i > 0) x += SEG_GAP
    if (s.bar) {
      const p = Math.max(0, Math.min(100, s.bar.pct))
      const filled = Math.round((p / 100) * BAR_W)
      const [c1, c2] = p < 70 ? [t.accent, t.accent2] : p < 85 ? ['#d97706', YELLOW] : ['#e11d48', RED]
      const gid = `rc${hex(c1)}${hex(c2)}`
      const y = (ROUND_H - 4) / 2
      parts.push(`<defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`)
      parts.push(`<rect x="${x}" y="${y}" width="${BAR_W}" height="4" rx="2" fill="#ffffff" fill-opacity="0.12"/>`)
      parts.push(`<rect x="${x}" y="${y}" width="${filled}" height="4" rx="2" fill="url(#${gid})"/>`)
      if (s.bar.timePct !== undefined) {
        const tx = x + Math.max(0, Math.min(BAR_W - 2, (s.bar.timePct / 100) * BAR_W - 1))
        parts.push(`<rect x="${tx.toFixed(1)}" y="${(ROUND_H - BAR_H) / 2}" width="2" height="${BAR_H}" rx="1" fill="#ffffff" fill-opacity="0.9"/>`)
      }
      x += BAR_W
    } else if (s.text) {
      parts.push(`<text x="${x.toFixed(1)}" y="${ROUND_H / 2 + FONT_SIZE * 0.36}" fill="${s.color}"${s.bold ? ' font-weight="700"' : ''}>${esc(s.text)}</text>`)
      x += textWidth(s.text, s.bold)
    }
  })
  const width = Math.ceil(x + PAD_X)
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROUND_H}" viewBox="0 0 ${width} ${ROUND_H}" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" font-size="${FONT_SIZE}"><rect width="${width}" height="${ROUND_H}" rx="${ROUND_H / 2}" fill="${bg}"/>${parts.join('')}</svg>`
  return { source, width }
}

// ─── Limites : lecture, mémoire, projections ───
function toLimit(l: StoredLimit, windowMs: number | undefined, now: number): Limit {
  const resetsAtMs = l.resetsAt ? new Date(l.resetsAt).getTime() : undefined
  const isReset = resetsAtMs !== undefined && resetsAtMs <= now
  const percent = isReset ? 0 : l.percentUsed
  const resetsInMs = resetsAtMs !== undefined && !isReset ? resetsAtMs - now : undefined
  const limit: Limit = { percent, resetsAtMs: isReset ? undefined : resetsAtMs, resetsInMs, ageMs: Math.max(0, now - l.seenAt), isReset }
  if (windowMs && resetsInMs !== undefined) {
    const elapsed = Math.max(1, windowMs - resetsInMs)
    limit.pace = (elapsed / windowMs) * 100 - percent
    if (percent > 0 && percent < 100) {
      const emptyInMs = ((100 - percent) / percent) * elapsed
      if (emptyInMs < resetsInMs) {
        limit.emptyInMs = emptyInMs
        limit.emptyAtMs = now + emptyInMs
      }
    }
    if (windowMs === WEEK_MS) limit.perDay = (100 - percent) / Math.max(resetsInMs / (24 * HOUR), 0.25)
  }
  return limit
}

// Les limites vont dans claude-kit/limits.json, partagé par toutes les sessions :
// dès qu'un onglet reçoit une réponse de Claude, les autres affichent les mêmes chiffres.
async function readSharedLimits($: EngineInterface): Promise<Record<string, StoredLimit>> {
  try {
    const raw = JSON.parse(String(await $.fs.read(await limitsPath($))))
    return isObj(raw) ? (raw as Record<string, StoredLimit>) : {}
  } catch {
    // pas encore de fichier : reprend ce que l'ancienne version gardait pour elle
    return ((await $.store.get(STORE_KEY).catch(() => undefined)) ?? {}) as Record<string, StoredLimit>
  }
}

async function readLimits($: EngineInterface, usage: SessionUsage, now: number) {
  const stored = await readSharedLimits($)
  const fresh = usage.rateLimits.filter((l: SessionRateLimit) => typeof l.percentUsed === 'number')
  let changed = false
  for (const l of fresh) {
    const prev = stored[l.kind]
    if (prev && prev.percentUsed === l.percentUsed && prev.resetsAt === l.resetsAt && now - prev.seenAt < 60_000) continue
    stored[l.kind] = { kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt, seenAt: now }
    changed = true
  }
  if (changed) await $.fs.write(await limitsPath($), `${JSON.stringify(stored, null, 2)}\n`).catch(() => undefined)
  const get = (kind: string, windowMs?: number) => (stored[kind] ? toLimit(stored[kind]!, windowMs, now) : undefined)
  return { session: get('five_hour', SESSION_MS), week: get('seven_day', WEEK_MS), spend: get('spend_limit') }
}

function contextOf(usage: SessionUsage): Usage['context'] {
  const { tokens, window, percent } = usage.context
  const p = percent ?? (tokens !== undefined && window > 0 ? (tokens / window) * 100 : undefined)
  return p === undefined ? undefined : { percent: p, tokens, window }
}

// ─── Git ───
async function readGit($: EngineInterface, now: number): Promise<Git | null> {
  try {
    const cwd = await $.session.cwd()
    const run = (argv: string[]) => $.process.run(argv, { cwd, timeoutMs: 1500 })
    const status = await run(['git', 'status', '--porcelain=v2', '--branch'])
    if (status.exitCode !== 0) return null
    const g: Git = { branch: '', staged: 0, modified: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0, added: 0, removed: 0 }
    let oid = ''
    for (const line of status.stdout.split('\n')) {
      if (line.startsWith('# branch.head ')) g.branch = line.slice(14)
      else if (line.startsWith('# branch.oid ')) oid = line.slice(13, 20)
      else if (line.startsWith('# branch.ab ')) {
        const [a, b] = line.slice(12).split(' ')
        g.ahead = Math.abs(Number(a) || 0)
        g.behind = Math.abs(Number(b) || 0)
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        if (line[2] !== '.') g.staged++
        if (line[3] !== '.') g.modified++
      } else if (line.startsWith('u ')) g.conflicts++
      else if (line.startsWith('? ')) g.untracked++
    }
    if (g.branch === '(detached)') g.branch = `@${oid}`
    const [diff, last] = await Promise.all([
      run(['git', 'diff', 'HEAD', '--shortstat']).catch(() => undefined),
      run(['git', 'log', '-1', '--format=%ct']).catch(() => undefined),
    ])
    if (diff?.exitCode === 0) {
      g.added = Number(/(\d+) insertion/.exec(diff.stdout)?.[1] ?? 0)
      g.removed = Number(/(\d+) deletion/.exec(diff.stdout)?.[1] ?? 0)
    }
    const ct = Number(last?.stdout.trim())
    if (last?.exitCode === 0 && ct > 0) g.lastCommitAgeMs = Math.max(0, now - ct * 1000)
    return g
  } catch {
    return null
  }
}

// Décalage horaire de la machine, lu une fois (« +0100 » → 60)
let tzCache: Promise<number | undefined> | undefined
const readTz = ($: EngineInterface) =>
  (tzCache ??= $.process
    .run(['date', '+%z'], { timeoutMs: 1000 })
    .then(({ exitCode, stdout }) => {
      const m = /^([+-])(\d{2})(\d{2})/.exec(stdout.trim())
      if (exitCode !== 0 || !m) return undefined
      return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
    })
    .catch(() => undefined))

let isRunning = false
let isPending = false

// ─── Publication de l'état de la session (lu par le plugin Stream Deck) ───
// Un fichier par session : claude-kit/sessions/<id>.json. Le Stream Deck affiche la plus récente
// (ou celle du projet choisi sur la touche).
type Activity = 'working' | 'idle'
let activity: Activity = 'idle'
let activitySince = 0
let lastPublished = ''

async function publishSession($: EngineInterface, usage: Usage | null, force = false) {
  if (!usage) return
  if (!normalizeConfig(await read($, configAtom)).streamdeck.publish) return
  try {
    const [id, cwd, now, turn] = await Promise.all([$.session.id(), $.session.cwd(), $.clock.now(), read($, turnAtom)])
    const configPath = (await read($, configPathAtom)) || (await resolveConfigPath($))
    const path = configPath.replace(/config\.json$/, `sessions/${id}.json`)
    const snapshot = {
      version: 1,
      sessionId: id,
      project: cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd,
      cwd,
      model: usage.model,
      activity,
      activitySince,
      cost: usage.cost,
      elapsedMs: usage.elapsedMs,
      turns: usage.turns,
      context: usage.context ?? null,
      git: usage.git,
      lastTurn: turn,
    }
    const body = JSON.stringify(snapshot)
    // évite d'écrire le même contenu en boucle ; « updatedAt » ne compte pas dans la comparaison
    if (!force && body === lastPublished) return
    lastPublished = body
    await $.fs.write(path, `${JSON.stringify({ ...snapshot, updatedAt: now }, null, 2)}\n`)
  } catch {
    // le Stream Deck est un bonus : une erreur d'écriture ne doit jamais gêner la session
  }
}

async function setActivity($: EngineInterface, next: Activity) {
  activity = next
  activitySince = await $.clock.now().catch(() => 0)
  await publishSession($, await read($, usageAtom), true)
}

async function refresh($: EngineInterface): Promise<void> {
  if (isRunning) {
    isPending = true
    return
  }
  isRunning = true
  try {
    const [usage, now, model, turns, tzOffsetMin] = await Promise.all([
      $.session.usage(),
      $.clock.now(),
      $.session.model(),
      $.session.turns().catch(() => 0),
      readTz($),
    ])
    const [limits, git] = await Promise.all([readLimits($, usage, now), readGit($, now)])
    const next: Usage = {
      model: prettyModel(model),
      cost: usage.cost?.usd ?? 0,
      elapsedMs: Math.max(0, now - usage.startedAt),
      turns,
      tzOffsetMin,
      context: contextOf(usage),
      ...limits,
      git,
    }
    await update($, usageAtom, () => next)
    await publishSession($, next)
  } catch {
    // on garde la dernière bande affichée
  } finally {
    isRunning = false
  }
  if (isPending) {
    isPending = false
    await refresh($)
  }
}


// ─── Stream Deck : détection et installation en un clic ───
// L'installeur du kit dépose le plugin dans claude-kit/streamdeck/ ; l'onglet « Stream Deck » de /kit
// l'ouvre avec l'app Stream Deck (qui l'installe), le met à jour ou le retire.
const SD_PLUGIN = 'io.github.mathyschn.claudekit.sdPlugin'
const SD_FILE = 'claude-kit.streamDeckPlugin'
const MAC_APP = '/Applications/Elgato Stream Deck.app'
const WIN_APP = 'C:/Program Files/Elgato/StreamDeck/StreamDeck.exe'

async function readVersion($: EngineInterface, manifestPath: string) {
  try {
    const m = JSON.parse(String(await $.fs.read(manifestPath))) as { Version?: string }
    return typeof m.Version === 'string' ? m.Version.replace(/\.0$/, '') : ''
  } catch {
    return ''
  }
}

async function detectStreamDeck($: EngineInterface, message = ''): Promise<StreamDeckState> {
  const configPath = (await read($, configPathAtom)) || (await resolveConfigPath($))
  const kitDir = configPath.replace(/\/config\.json$/, '')
  const home = ((await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '').replace(/\\/g, '/')
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const appData = ((await $.env.get('APPDATA')) ?? '').replace(/\\/g, '/')
  let platform: StreamDeckState['platform'] = 'other'
  if (isWindows) platform = 'windows'
  else {
    const uname = await $.process.run(['uname'], { timeoutMs: 1500 }).catch(() => undefined)
    if (uname?.stdout.trim() === 'Darwin') platform = 'mac'
  }
  const pluginsDir =
    platform === 'mac' ? `${home}/Library/Application Support/com.elgato.StreamDeck/Plugins` : platform === 'windows' ? `${appData}/Elgato/StreamDeck/Plugins` : ''
  const exists = (p: string) => (p ? $.fs.exists(p).catch(() => false) : Promise.resolve(false))
  const bundledFile = `${kitDir}/streamdeck/${SD_FILE}`
  const [appFound, dataFound, installed, bundled, installedVersion, bundledVersion, now] = await Promise.all([
    exists(platform === 'mac' ? MAC_APP : platform === 'windows' ? WIN_APP : ''),
    exists(pluginsDir),
    exists(pluginsDir && `${pluginsDir}/${SD_PLUGIN}`),
    exists(bundledFile),
    pluginsDir ? readVersion($, `${pluginsDir}/${SD_PLUGIN}/manifest.json`) : Promise.resolve(''),
    readVersion($, `${kitDir}/streamdeck/${SD_PLUGIN}/manifest.json`),
    $.clock.now(),
  ])
  const state: StreamDeckState = {
    platform,
    appFound: appFound || dataFound,
    pluginsDir,
    installed,
    installedVersion,
    bundled,
    bundledVersion,
    bundledFile,
    busy: false,
    message,
    checkedAt: now,
  }
  await update($, sdAtom, () => state)
  return state
}

async function sdBusy($: EngineInterface, message: string) {
  await update($, sdAtom, s => (s ? { ...s, busy: true, message } : s))
}

// Installer ou mettre à jour : on ouvre le fichier .streamDeckPlugin, l'app Stream Deck fait le reste
async function installStreamDeck($: EngineInterface) {
  const sd = (await read($, sdAtom)) ?? (await detectStreamDeck($))
  if (!sd.bundled) {
    await detectStreamDeck($, 'Plugin introuvable dans claude-kit : relance « node install.js » dans le dossier du kit.')
    return
  }
  await sdBusy($, 'Ouverture de Stream Deck…')
  const argv = sd.platform === 'mac' ? ['open', sd.bundledFile] : sd.platform === 'windows' ? ['cmd', '/c', 'start', '""', sd.bundledFile.replace(/\//g, '\\')] : null
  if (!argv) {
    await detectStreamDeck($, "Stream Deck n'existe que sur macOS et Windows.")
    return
  }
  const r = await $.process.run(argv, { timeoutMs: 15000 }).catch(() => undefined)
  if (!r || r.exitCode !== 0) {
    await detectStreamDeck($, "Impossible d'ouvrir le plugin. Double-clique sur le fichier indiqué ci-dessous.")
    return
  }
  // l'app Stream Deck demande confirmation puis installe : on revérifie un peu plus tard
  await detectStreamDeck($, 'Valide l\'installation dans la fenêtre de Stream Deck.')
  for (const wait of [4000, 6000, 10000]) {
    await $.clock.sleep(wait)
    const s = await detectStreamDeck($, 'Valide l\'installation dans la fenêtre de Stream Deck.')
    if (s.installed && s.installedVersion === s.bundledVersion) {
      await detectStreamDeck($, 'Plugin installé : ajoute les touches depuis la catégorie « Claude Kit ».')
      $.ui.toast('Plugin Stream Deck installé')
      return
    }
  }
}

async function uninstallStreamDeck($: EngineInterface) {
  const sd = (await read($, sdAtom)) ?? (await detectStreamDeck($))
  if (!sd.installed || !sd.pluginsDir) return
  await sdBusy($, 'Désinstallation…')
  const dir = `${sd.pluginsDir}/${SD_PLUGIN}`
  // chemin vérifié : on ne supprime que le dossier du plugin claude-kit
  if (!dir.endsWith(`/Plugins/${SD_PLUGIN}`)) return
  if (sd.platform === 'mac') {
    await $.process.run(['osascript', '-e', 'quit app "Elgato Stream Deck"'], { timeoutMs: 8000 }).catch(() => undefined)
    await $.process.run(['rm', '-rf', dir], { timeoutMs: 8000 }).catch(() => undefined)
    await $.process.run(['open', '-a', 'Elgato Stream Deck'], { timeoutMs: 8000 }).catch(() => undefined)
  } else if (sd.platform === 'windows') {
    const win = dir.replace(/\//g, '\\').replace(/'/g, "''")
    await $.process
      .run(['powershell', '-NoProfile', '-Command',
        `Stop-Process -Name StreamDeck -ErrorAction SilentlyContinue; Start-Sleep 1; Remove-Item -Recurse -Force '${win}'; Start-Process '${WIN_APP.replace(/\//g, '\\')}'`],
        { timeoutMs: 15000 })
      .catch(() => undefined)
  }
  await detectStreamDeck($, 'Plugin retiré.')
}

async function openStreamDeckApp($: EngineInterface) {
  const sd = (await read($, sdAtom)) ?? (await detectStreamDeck($))
  const argv = sd.platform === 'mac' ? ['open', '-a', 'Elgato Stream Deck'] : sd.platform === 'windows' ? ['cmd', '/c', 'start', '""', WIN_APP.replace(/\//g, '\\')] : null
  if (argv) await $.process.run(argv, { timeoutMs: 8000 }).catch(() => undefined)
}

// ─── Mises à jour (hooks/update.js fait le travail ; ici on affiche et on déclenche) ───
let sessionStartedAt = 0

const kitPath = async ($: EngineInterface, file: string) =>
  ((await read($, configPathAtom)) || (await resolveConfigPath($))).replace(/config\.json$/, file)

async function loadUpdate($: EngineInterface, patch: Partial<UpdateState> = {}) {
  const readObj = async (file: string) => {
    try {
      const raw = JSON.parse(String(await $.fs.read(await kitPath($, file))))
      return isObj(raw) ? raw : {}
    } catch {
      return {}
    }
  }
  const [status, version] = await Promise.all([readObj('update.json'), readObj('version.json')])
  const states = ['up-to-date', 'available', 'updating', 'installed', 'error']
  const prev = await read($, updateAtom)
  const next: UpdateState = {
    installed: typeof version.version === 'string' ? version.version : '',
    latest: typeof status.latest === 'string' ? status.latest : '',
    state: (states.includes(String(status.state)) ? status.state : 'unknown') as UpdateState['state'],
    notes: Array.isArray(status.notes) ? status.notes.filter((n): n is string => typeof n === 'string') : [],
    checkedAt: typeof status.checkedAt === 'number' ? status.checkedAt : 0,
    installedAt: typeof status.installedAt === 'number' ? status.installedAt : 0,
    message: typeof status.message === 'string' ? status.message : '',
    busy: prev?.busy ?? false,
    ...patch,
  }
  await update($, updateAtom, () => next)
  return next
}

// Lance hooks/update.js (--check ou --now) avec le Node de la machine
async function runUpdater($: EngineInterface, mode: '--check' | '--now') {
  const current = await read($, updateAtom)
  if (current?.busy) return
  await loadUpdate($, { busy: true, message: mode === '--now' ? 'Mise à jour en cours…' : 'Vérification…' })
  const script = await kitPath($, 'hooks/update.js')
  const r = await $.process.run(['node', script, mode], { timeoutMs: mode === '--now' ? 180_000 : 30_000 }).catch(() => undefined)
  const s = await loadUpdate($, { busy: false })
  if (!r || r.exitCode !== 0) await loadUpdate($, { busy: false, state: 'error', message: 'Impossible de lancer la mise à jour (Node introuvable ?)' })
  else if (mode === '--now' && s.state === 'installed') $.ui.toast(`claude-kit ${s.installed} installé · redémarre Claude pour tout charger`)
  else if (mode === '--check') $.ui.toast(s.state === 'available' ? `Version ${s.latest} disponible` : s.state === 'up-to-date' ? 'claude-kit est à jour' : s.message || 'Vérification terminée')
}

const formatAgo = (ms: number) => (ms < 60_000 ? "à l'instant" : `il y a ${formatDuration(ms)}`)

async function openSettings($: EngineInterface) {
  await $.ui.open({ id: PANE_ID, title: 'claude-kit · Réglages', focus: true, closeOnEscape: true })
}

export const register: Register = on => {
  let turnStartedAt = 0
  let turnTools = 0

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await loadConfig($)
    await $.command.register({ name: 'kit', description: 'Réglages de claude-kit : bande, couleurs, notifications, sécurité, automatisations' })
    void refresh($)
    // Synchronisation entre onglets : toutes les 2 s, on regarde si config.json ou limits.json
    // ont changé (un autre onglet, le panneau, une modif à la main) et on relit seulement dans ce cas.
    const configPath = await read($, configPathAtom)
    const sharedLimits = await limitsPath($)
    let seenConfig = await mtimeOf($, configPath)
    let seenLimits = await mtimeOf($, sharedLimits)
    const updatePath = await kitPath($, 'update.json')
    let seenUpdate = await mtimeOf($, updatePath)
    sessionStartedAt = await $.clock.now()
    await loadUpdate($)
    $.clock.every(WATCH_MS, async () => {
      const [c, l, u] = await Promise.all([mtimeOf($, configPath), mtimeOf($, sharedLimits), mtimeOf($, updatePath)])
      if (u !== seenUpdate) {
        seenUpdate = u
        await loadUpdate($)
      }
      if (c !== seenConfig) {
        seenConfig = c
        await loadConfig($).catch(() => undefined)
      }
      if (l !== seenLimits) {
        seenLimits = l
        await refresh($)
      }
    })
    $.clock.every(REFRESH_MS, () => refresh($))
    return started
  })

  on('command.run', { command: 'kit' }, async ($, e) => {
    const wanted = e.args.trim().toLowerCase()
    const tabs: Record<string, Tab> = { bande: 'band', couleurs: 'look', notifications: 'notifications', notifs: 'notifications', securite: 'security', sécurité: 'security', auto: 'automation', streamdeck: 'streamdeck', stream: 'streamdeck', 'stream deck': 'streamdeck', apropos: 'about', 'à propos': 'about', maj: 'about', update: 'about', 'mise à jour': 'about' }
    if (tabs[wanted]) await update($, tabAtom, () => tabs[wanted]!)
    if (tabs[wanted] === 'streamdeck') void detectStreamDeck($)
    await openSettings($)
    return { text: 'Réglages de claude-kit ouverts.' }
  })

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    void refresh($)
    return measured
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now().catch(() => 0)
    turnTools = 0
    void setActivity($, 'working')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined) turnTools += 1
    const result = await next(e)
    if (e.tool === 'Bash' || e.tool === 'Edit' || e.tool === 'Write') void refresh($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)
    if (e.agentId === undefined && turnStartedAt) {
      const turn: Turn = { seconds: Math.round(((await $.clock.now()) - turnStartedAt) / 1000), tools: turnTools }
      await update($, turnAtom, () => turn)
      void setActivity($, 'idle')
    }
    void refresh($)
    return completed
  })

  // ═════════════════════════ La bande ═════════════════════════
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [usage, turn, rawConfig, upd] = await Promise.all([read($, usageAtom), read($, turnAtom), read($, configAtom), read($, updateAtom)])
    if (e.props.hasSurvey || usage === null) return next(e)
    const kit = normalizeConfig(rawConfig)
    const st = kit.band
    const money = (usd: number) => formatMoney(usd, kit.general.currency, kit.general.usdToEur)
    const t = makeTheme(st.accent, st.accent2)

    const { Box, Text, Button } = $.ui.resolve(e)
    const Svg = e.surface === 'terminal' ? undefined : $.ui.resolve(e).Svg
    const isTerminal = Svg === undefined
    const tz = usage.tzOffsetMin
    const isHidden = (id: ElementId) => st.hidden.includes(id)

    // ── Contenu d'une puce : une suite de segments (texte coloré ou barre) ──
    type Seg = { key: string; text?: string; color?: string; bold?: boolean; dim?: boolean; bar?: { pct: number; timePct?: number } }
    type Part = Seg | false | null | undefined | 0
    const M = (key: string, text: string): Seg => ({ key, text, color: isTerminal ? undefined : t.muted, dim: isTerminal })
    const S = (key: string, text: string, color?: string): Seg => ({ key, text, bold: true, color: color ?? (isTerminal ? undefined : t.text) })
    const L = (key: string, text: string): Seg => ({ key, text, bold: true, color: t.accent2 })
    const C = (key: string, text: string, color: string, bold = false): Seg => ({ key, text, color, bold })

    const segNode = (s: Seg) =>
      s.bar ? (
        Svg ? (
          <Svg key={s.key} source={barSvg(s.bar.pct, t, s.bar.timePct)} alt={`${Math.round(s.bar.pct)} %`} width={BAR_W} height={BAR_H} />
        ) : (
          <Text key={s.key} color={levelColor(s.bar.pct, t)}>{textBar(s.bar.pct, 6)}</Text>
        )
      ) : (
        <Text key={s.key} bold={s.bold} dimColor={s.dim} color={s.color}>{s.text}</Text>
      )

    // Quatre styles : arrondi (une image aux bords ronds, même hauteur que carré), carré, contour, texte seul
    const chip = (key: string, parts: Part[], isAlert = false, extra?: RenderChildren) => {
      const segs = parts.filter((p): p is Seg => Boolean(p))
      const bg = isAlert ? mix(t.chipBg, RED, 0.25) : t.chipBg
      if (Svg && st.chip === 'round') {
        const drawn = roundChipSvg(segs.map(s => ({ text: s.text, color: s.color ?? t.text, bold: s.bold, bar: s.bar })), bg, t)
        const alt = segs.map(s => s.text ?? (s.bar ? `${Math.round(s.bar.pct)} %` : '')).join(' ')
        const pill = <Svg key={key} source={drawn.source} alt={alt} width={drawn.width} height={ROUND_H} />
        return extra ? <Box key={key} flexDirection="row" alignItems="center" gap={1}>{pill}{extra}</Box> : pill
      }
      const children = [...segs.map(segNode), extra]
      if (isTerminal || st.chip === 'plain') return <Box key={key} flexDirection="row" gap={1}>{children}</Box>
      if (st.chip === 'outline') {
        return (
          <Box key={key} flexDirection="row" alignItems="center" gap={1} borderStyle="round" borderColor={isAlert ? RED : t.chipBorder}
            backgroundColor={t.chipBg} hover={{ borderColor: isAlert ? RED : t.chipHover }} paddingX={1}>
            {children}
          </Box>
        )
      }
      return (
        <Box key={key} flexDirection="row" alignItems="center" gap={1} backgroundColor={bg}
          hover={{ backgroundColor: mix(t.chipBg, t.accent, 0.25) }} paddingX={1}>
          {children}
        </Box>
      )
    }

    const limitChip = (key: string, name: string, l: Limit, windowMs?: number) => {
      const timePct = windowMs && l.resetsInMs !== undefined ? ((windowMs - l.resetsInMs) / windowMs) * 100 : undefined
      const resetClock = st.showResetClock && l.resetsAtMs !== undefined ? formatClock(l.resetsAtMs, tz, windowMs === WEEK_MS) : undefined
      const pctColor = l.percent >= 90 ? RED : l.percent >= 70 ? YELLOW : undefined
      return chip(key, [
        L('l', name),
        { key: 'b', bar: { pct: l.percent, timePct } },
        S('p', `${Math.round(l.percent)}%`, pctColor),
        st.showPace && l.pace !== undefined && C('pace', formatPace(l.pace), paceColor(l.pace)),
        l.emptyInMs !== undefined &&
          C('empty', `⚠ vide ${l.emptyAtMs !== undefined && formatClock(l.emptyAtMs, tz) ? `~${formatClock(l.emptyAtMs, tz)}` : `dans ${formatDuration(l.emptyInMs)}`}`, l.emptyInMs < HOUR ? RED : ORANGE, true),
        l.perDay !== undefined && M('day', `≈${Math.round(l.perDay)}%/j`),
        l.resetsInMs !== undefined && M('r', `↻ ${resetClock ? `${resetClock} (${formatDuration(l.resetsInMs)})` : formatDuration(l.resetsInMs)}`),
        l.isReset && C('rz', 'réinitialisé', GREEN),
        l.ageMs > STALE_MS && M('age', `· il y a ${formatDuration(l.ageMs)}`),
      ], l.percent >= 90)
    }

    const ctx = usage.context
    const costPerHour = usage.elapsedMs > 10 * 60_000 && usage.cost > 0 ? usage.cost / (usage.elapsedMs / HOUR) : undefined
    const g = usage.git
    const commitLate = g?.lastCommitAgeMs !== undefined && g.lastCommitAgeMs > 2 * HOUR && g.added + g.removed > 0
    const noLimits = !usage.session && !usage.week && !usage.spend

    const gitFlags = (git: Git): Seg[] => {
      const flags: Seg[] = []
      if (git.conflicts) flags.push(C('x', `✖${git.conflicts}`, RED))
      if (git.staged) flags.push(C('s', `●${git.staged}`, GREEN))
      if (git.modified) flags.push(C('m', `✚${git.modified}`, YELLOW))
      if (git.untracked) flags.push(C('u', `?${git.untracked}`, t.muted))
      if (git.ahead) flags.push(C('a', `↑${git.ahead}`, CYAN))
      if (git.behind) flags.push(C('b', `↓${git.behind}`, ORANGE))
      if (!flags.length) flags.push(C('ok', '✓', GREEN))
      return flags
    }
    const compactButton = <Button key="compact" label="⚠ /compact" plain onPress={() => $.prompt.fill({ text: '/compact ' })} />

    // Chaque élément, rendu à la demande dans l'ordre choisi
    const draw: Record<ElementId, () => RenderChildren> = {
      brand: () =>
        st.brandLabel.trim()
          ? Svg ? (
              <Svg key="brand" source={brandSvg(st.brandLabel, t)} alt={st.brandLabel} width={brandWidth(st.brandLabel)} height={16} />
            ) : (
              <Text key="brand" bold color={t.accent2}>◆ {st.brandLabel}</Text>
            )
          : null,
      'five-hour': () =>
        usage.session
          ? limitChip('five-hour', '5h', usage.session, SESSION_MS)
          : noLimits && chip('nolimits', [L('l', '5h · Semaine'), M('m', 'après ta prochaine réponse de Claude')]),
      week: () => usage.week && limitChip('week', 'Semaine', usage.week, WEEK_MS),
      spend: () => usage.spend && limitChip('spend', 'Budget mois', usage.spend),
      ctx: () =>
        ctx &&
        (Svg ? (
          <Box key="ctx" flexDirection="row" alignItems="center" gap={1}>
            <Svg key="pill" source={contextSvg(ctx, t)} alt={`Contexte ${Math.round(ctx.percent)} %`} width={PILL_W} height={PILL_H} />
            {ctx.percent >= 80 && compactButton}
          </Box>
        ) : (
          chip('ctx', [C('bar', `ctx ${textBar(ctx.percent)} ${Math.round(ctx.percent)}%`, levelColor(ctx.percent, t))], ctx.percent >= 90, ctx.percent >= 80 && compactButton)
        )),
      cost: () =>
        chip('cost', [
          S('usd', money(usage.cost)),
          costPerHour !== undefined && M('rate', `${money(costPerHour)}/h`),
          M('dur', `⏱ ${formatDuration(usage.elapsedMs)}`),
          usage.turns > 0 && M('turns', `· ${usage.turns} msg`),
        ]),
      git: () =>
        g &&
        chip('git', [
          C('br', `⎇ ${g.branch}`, PINK, true),
          ...gitFlags(g),
          (g.added > 0 || g.removed > 0) && C('add', `+${g.added}`, GREEN),
          (g.added > 0 || g.removed > 0) && C('del', `−${g.removed}`, RED),
          g.lastCommitAgeMs !== undefined &&
            (commitLate ? C('lc', `commit ${formatDuration(g.lastCommitAgeMs)}`, ORANGE) : M('lc', `commit ${formatDuration(g.lastCommitAgeMs)}`)),
        ]),
      turn: () => turn && chip('turn', [M('t', `↳ ${turn.seconds < 60 ? `${turn.seconds}s` : formatDuration(turn.seconds * 1000)} · ${turn.tools} outil${turn.tools > 1 ? 's' : ''}`)]),
      model: () => chip('model', [S('m', `◆ ${usage.model}`, t.accent2)]),
    }

    const visible = st.order.filter(id => !isHidden(id))
    // Mise à jour : installée pendant la session (redémarrer pour charger la bande) ou disponible
    const updateChip =
      upd && upd.state === 'installed' && upd.installedAt > sessionStartedAt ? (
        <Button key="upd" label={`✨ claude-kit ${upd.installed} installé · redémarre Claude`} plain onPress={async () => {
          await update($, tabAtom, () => 'about')
          await openSettings($)
        }} />
      ) : upd && upd.state === 'available' && kit.updates.mode !== 'off' ? (
        <Button key="upd" label={`↑ claude-kit ${upd.latest} disponible`} plain onPress={async () => {
          await update($, tabAtom, () => 'about')
          await openSettings($)
        }} />
      ) : null
    const gear = [updateChip, <Button key="gear" label="⚙" plain dimColor onPress={() => openSettings($)} />]
    const row = (key: string, ids: ElementId[], withGear: boolean) => {
      const items = ids.map(id => draw[id]()).filter(Boolean)
      if (!items.length && !withGear) return null
      return (
        <Box key={key} flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
          {items}
          {withGear && gear}
        </Box>
      )
    }

    if (st.layout === 'one') return <Box flexDirection="column">{row('all', visible, true)}</Box>
    const top = visible.filter(id => LIMIT_IDS.includes(id))
    const bottom = visible.filter(id => !LIMIT_IDS.includes(id))
    return (
      <Box flexDirection="column" gap={isTerminal ? 0 : 1}>
        {row('limits', top, false)}
        {row('session', bottom, true)}
      </Box>
    )
  })

  // ═════════════════════════ Le panneau de réglages ═════════════════════════
  const TABS: { id: Tab; label: string }[] = [
    { id: 'band', label: 'Bande' },
    { id: 'look', label: 'Couleurs' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Sécurité' },
    { id: 'automation', label: 'Automatisations' },
    { id: 'streamdeck', label: 'Stream Deck' },
    { id: 'about', label: 'À propos' },
  ]

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const [rawConfig, hexDraft, tab, configPath, sd, upd] = await Promise.all([
      read($, configAtom),
      read($, hexDraftAtom),
      read($, tabAtom),
      read($, configPathAtom),
      read($, sdAtom),
      read($, updateAtom),
    ])
    const kit = normalizeConfig(rawConfig)
    const st = kit.band
    const t = makeTheme(st.accent, st.accent2)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // un champ de saisie ou une liste déroulante n'existe pas sur toutes les surfaces
    const Input = 'Input' in els ? els.Input : undefined
    const Select = 'Select' in els ? els.Select : undefined
    const Link = 'Link' in els ? els.Link : undefined
    const set = (fn: (c: KitConfig) => KitConfig) => changeConfig($, fn)
    const setBand = (fn: (b: Settings) => Settings) => changeBand($, fn)

    // ── Briques d'interface ──
    const card = (key: string, title: string, children: RenderChildren, hint?: string) => (
      <Box key={key} flexDirection="column" gap={1} borderStyle="round" borderColor={t.chipBorder} paddingX={1} paddingY={0}>
        <Box flexDirection="column">
          <Text bold color={t.accent2}>{title}</Text>
          {hint && <Text dimColor size="footnote">{hint}</Text>}
        </Box>
        {children}
      </Box>
    )
    const row = (key: string, title: string, hint: string | undefined, control: RenderChildren, isOff = false) => (
      <Box key={key} flexDirection="row" justifyContent="space-between" alignItems="center" gap={2}>
        <Box flexDirection="column" flexShrink={1}>
          <Text bold dimColor={isOff}>{title}</Text>
          {hint && <Text dimColor size="footnote">{hint}</Text>}
        </Box>
        <Box flexDirection="row" gap={1} flexShrink={0} alignItems="center">{control}</Box>
      </Box>
    )
    const toggle = (key: string, isOn: boolean, onChange: (v: boolean) => void, disabled = false) => (
      <Button key={key} label={isOn ? 'Activé' : 'Désactivé'} variant={isOn && !disabled ? 'primary' : undefined} dimColor={!isOn || disabled}
        onPress={() => onChange(!isOn)} />
    )
    const segmented = <V extends string | number>(key: string, value: V, options: { value: V; label: string }[], onChange: (v: V) => void) => (
      <Box key={key} flexDirection="row" gap={0} flexWrap="wrap">
        {options.map(o => (
          <Button key={`${key}-${o.value}`} label={o.label} variant={o.value === value ? 'primary' : undefined} dimColor={o.value !== value}
            onPress={() => onChange(o.value)} />
        ))}
      </Box>
    )
    // Liste déroulante si la surface en a une, sinon boutons
    const pick = (key: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void) =>
      Select ? <Select key={key} value={value} options={options} onSelect={v => onChange(v)} /> : segmented(key, value, options, onChange)

    const hours = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))

    // ── Onglets ──
    const tabsBar = (
      <Box key="tabs" flexDirection="row" gap={1} flexWrap="wrap">
        {TABS.map(x => (
          <Button key={`tab-${x.id}`} label={x.label} variant={x.id === tab ? 'primary' : undefined} dimColor={x.id !== tab}
            onPress={async () => {
              await update($, tabAtom, () => x.id)
              if (x.id === 'streamdeck') await detectStreamDeck($)
              if (x.id === 'about') await loadUpdate($)
            }} />
        ))}
      </Box>
    )

    const moveEl = (id: ElementId, delta: number) =>
      setBand(b => {
        const order = [...b.order]
        const i = order.indexOf(id)
        const j = i + delta
        if (i < 0 || j < 0 || j >= order.length) return b
        ;[order[i], order[j]] = [order[j]!, order[i]!]
        return { ...b, order }
      })
    const showEl = (id: ElementId, isOn: boolean) =>
      setBand(b => ({ ...b, hidden: isOn ? b.hidden.filter(h => h !== id) : [...new Set([...b.hidden, id])] }))

    const n = kit.notifications
    const gd = kit.guard
    const fm = kit.format
    const sc = kit.sessionContext

    const body: Record<Tab, () => RenderChildren> = {
      band: () => [
        card('layout', 'Disposition', [
          row('lines', 'Lignes', 'Les limites sur leur propre ligne, ou tout à la suite',
            segmented('layout', st.layout, [{ value: 'two', label: 'Limites au-dessus' }, { value: 'one', label: 'Une ligne' }], v => setBand(b => ({ ...b, layout: v })))),
          row('chips', 'Style des puces', 'Arrondi et Carré sont les plus fins',
            segmented('chip', st.chip, [
              { value: 'round', label: 'Arrondi' },
              { value: 'pill', label: 'Carré' },
              { value: 'outline', label: 'Contour' },
              { value: 'plain', label: 'Texte' },
            ], v => setBand(b => ({ ...b, chip: v })))),
        ]),
        card('elements', 'Éléments', st.order.map((id, i) => {
          const isOn = !st.hidden.includes(id)
          return row(`el-${id}`, `${i + 1}. ${ELEMENTS[id]}`, ELEMENT_HINTS[id], [
            <Button key={`up-${id}`} label="↑" plain dimColor={i === 0} onPress={() => moveEl(id, -1)} />,
            <Button key={`down-${id}`} label="↓" plain dimColor={i === st.order.length - 1} onPress={() => moveEl(id, 1)} />,
            toggle(`on-${id}`, isOn, v => showEl(id, v)),
          ], !isOn)
        }), 'Flèches pour l\'ordre, interrupteur pour afficher'),
        card('limits-opts', 'Limites', [
          row('pace', 'Rythme (+/−)', 'En avance ou en retard sur le temps écoulé de la fenêtre', toggle('pace-t', st.showPace, v => setBand(b => ({ ...b, showPace: v })))),
          row('clock', 'Heure de reset', 'Affiche « 23:20 (2h00) » au lieu de « 2h00 »', toggle('clock-t', st.showResetClock, v => setBand(b => ({ ...b, showResetClock: v })))),
        ]),
      ],

      look: () => [
        card('themes', 'Thème', (
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {PRESETS.map(p => (
              <Button key={`preset-${p.id}`} variant={st.preset === p.id ? 'primary' : undefined}
                onPress={() => setBand(b => ({ ...b, preset: p.id, accent: p.accent, accent2: p.accent2 }))}>
                <Text color={p.accent}>●</Text>
                <Text color={p.accent2}>●</Text> {p.name}
              </Button>
            ))}
          </Box>
        ), 'Couleur des puces, des barres et du nom'),
        card('custom', 'Couleur personnalisée', [
          row('current', 'Couleurs actuelles', `${st.accent} · ${st.accent2}`, [
            <Text key="sw1" color={st.accent}>██</Text>,
            <Text key="sw2" color={st.accent2}>██</Text>,
          ]),
          Input && (
            <Input key="hex" label="Une ou deux couleurs hex" placeholder="#6d28d9 #ddd6fe" value={hexDraft} submitLabel="Appliquer"
              onInput={(v: string) => update($, hexDraftAtom, () => v)}
              onSubmit={(v: string) => {
                const found = v.match(/#?[0-9a-f]{6}/gi) ?? []
                const [c1, c2] = found.map((x: string) => (x.startsWith('#') ? x : `#${x}`))
                if (!c1) {
                  $.ui.toast('Couleur non reconnue : écris un code comme #7c3aed')
                  return
                }
                void setBand(b => ({ ...b, preset: 'perso', accent: c1, accent2: c2 ?? mix(c1, '#ffffff', 0.6) }))
                void update($, hexDraftAtom, () => '')
              }} />
          ),
        ]),
        card('identity', 'Nom affiché', [
          Input && (
            <Input key="brand" label="Texte de la pastille (vide = masquée)" placeholder={st.brandLabel || 'ex. ton prénom'} submitLabel="Enregistrer"
              onSubmit={(v: string) => setBand(b => ({ ...b, brandLabel: v.trim().slice(0, 16) }))} />
          ),
          st.brandLabel && row('brand-clear', `Actuel : ${st.brandLabel}`, undefined,
            <Button key="brand-x" label="Retirer" dimColor onPress={() => setBand(b => ({ ...b, brandLabel: '' }))} />),
        ]),
        card('money', 'Coût', [
          row('cur', 'Devise', 'Bande et statusline du terminal',
            segmented('currency', kit.general.currency, [{ value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }], v => set(c => ({ ...c, general: { ...c.general, currency: v } })))),
          row('budget', 'Budget par session', 'Le coût passe en jaune à la moitié, en rouge au-delà (statusline)',
            pick('budget-s', String(kit.general.budgetPerSession), ['2', '5', '10', '20', '50', '100'].map(v => ({ value: v, label: `${v} $` })),
              v => set(c => ({ ...c, general: { ...c.general, budgetPerSession: Number(v) } })))),
        ]),
      ],

      notifications: () => [
        card('notif-main', 'Notifications système', [
          row('n-on', 'Activer les notifications', 'macOS, Linux et Windows', toggle('n-on-t', n.enabled, v => set(c => ({ ...c, notifications: { ...c.notifications, enabled: v } })))),
          row('n-stop', 'Tâche terminée', 'Quand Claude a fini de répondre', toggle('n-stop-t', n.onStop, v => set(c => ({ ...c, notifications: { ...c.notifications, onStop: v } })), !n.enabled), !n.enabled),
          row('n-perm', 'Accord demandé', 'Quand Claude attend ta validation', toggle('n-perm-t', n.onPermission, v => set(c => ({ ...c, notifications: { ...c.notifications, onPermission: v } })), !n.enabled), !n.enabled),
          row('n-min', 'Durée minimale', 'Pas de notification « terminé » pour les tâches plus courtes',
            pick('n-min-s', String(n.minDurationSec), [
              { value: '0', label: 'Toujours' },
              { value: '10', label: '10 s' },
              { value: '20', label: '20 s' },
              { value: '60', label: '1 min' },
              { value: '120', label: '2 min' },
              { value: '300', label: '5 min' },
            ], v => set(c => ({ ...c, notifications: { ...c.notifications, minDurationSec: Number(v) } }))), !n.enabled),
        ]),
        card('notif-sound', 'Son', [
          row('s-on', 'Jouer un son', 'Avec chaque notification', toggle('s-on-t', n.sound, v => set(c => ({ ...c, notifications: { ...c.notifications, sound: v } })), !n.enabled), !n.enabled),
          row('s-name', 'Son', 'Sons système de macOS (Linux : son par défaut)', [
            pick('s-name-s', n.soundName, SOUNDS.map(x => ({ value: x, label: x })), v => set(c => ({ ...c, notifications: { ...c.notifications, soundName: v } }))),
            <Button key="s-test" label="▶ Écouter" dimColor onPress={async () => {
              const r = await $.process.run(['afplay', `/System/Library/Sounds/${n.soundName}.aiff`], { timeoutMs: 4000 }).catch(() => undefined)
              if (!r || r.exitCode !== 0) $.ui.toast('Aperçu du son disponible sur macOS uniquement')
            }} />,
          ], !n.enabled || !n.sound),
        ]),
        card('notif-quiet', 'Heures calmes', [
          row('q-on', 'Ne pas déranger', 'Aucune notification ni son pendant ce créneau', toggle('q-on-t', n.quietHours.enabled, v => set(c => ({ ...c, notifications: { ...c.notifications, quietHours: { ...c.notifications.quietHours, enabled: v } } })))),
          row('q-range', 'Créneau', `De ${String(n.quietHours.start).padStart(2, '0')}:00 à ${String(n.quietHours.end).padStart(2, '0')}:00`, [
            pick('q-start', String(n.quietHours.start), hours, v => set(c => ({ ...c, notifications: { ...c.notifications, quietHours: { ...c.notifications.quietHours, start: Number(v) } } }))),
            <Text key="q-to" dimColor>→</Text>,
            pick('q-end', String(n.quietHours.end), hours, v => set(c => ({ ...c, notifications: { ...c.notifications, quietHours: { ...c.notifications.quietHours, end: Number(v) } } }))),
          ], !n.quietHours.enabled),
        ]),
      ],

      security: () => [
        card('guard', 'Garde-fous', [
          row('g-on', 'Activer les garde-fous', 'Vérifie chaque commande et chaque accès fichier de Claude', toggle('g-on-t', gd.enabled, v => set(c => ({ ...c, guard: { ...c.guard, enabled: v } })))),
          row('g-deny', 'Bloquer les commandes destructrices', 'rm -rf /, curl | sh, force push sur main, mkfs, DROP DATABASE…',
            toggle('g-deny-t', gd.blockDangerous, v => set(c => ({ ...c, guard: { ...c.guard, blockDangerous: v } })), !gd.enabled), !gd.enabled),
          row('g-ask', 'Confirmer les commandes risquées', 'sudo, git reset --hard, DELETE sans WHERE, npm publish…',
            toggle('g-ask-t', gd.askRisky, v => set(c => ({ ...c, guard: { ...c.guard, askRisky: v } })), !gd.enabled), !gd.enabled),
          row('g-sec', 'Protéger les secrets', 'Demande avant de lire ou modifier .env, clés SSH, certificats',
            toggle('g-sec-t', gd.protectSecrets, v => set(c => ({ ...c, guard: { ...c.guard, protectSecrets: v } })), !gd.enabled), !gd.enabled),
          row('g-log', 'Journal de sécurité', 'claude-kit/security.log',
            toggle('g-log-t', gd.log, v => set(c => ({ ...c, guard: { ...c.guard, log: v } })), !gd.enabled), !gd.enabled),
        ]),
      ],

      automation: () => [
        card('format', 'Formatage automatique', [
          row('f-on', 'Formater après chaque modification', 'Utilise l\'outil du projet s\'il est installé', toggle('f-on-t', fm.enabled, v => set(c => ({ ...c, format: { ...c.format, enabled: v } })))),
          row('f-web', 'JS · TS · CSS · JSON · Markdown', 'Biome ou Prettier', toggle('f-web-t', fm.web, v => set(c => ({ ...c, format: { ...c.format, web: v } })), !fm.enabled), !fm.enabled),
          row('f-py', 'Python', 'Ruff', toggle('f-py-t', fm.python, v => set(c => ({ ...c, format: { ...c.format, python: v } })), !fm.enabled), !fm.enabled),
          row('f-go', 'Go', 'gofmt', toggle('f-go-t', fm.go, v => set(c => ({ ...c, format: { ...c.format, go: v } })), !fm.enabled), !fm.enabled),
          row('f-rs', 'Rust', 'rustfmt', toggle('f-rs-t', fm.rust, v => set(c => ({ ...c, format: { ...c.format, rust: v } })), !fm.enabled), !fm.enabled),
        ]),
        card('session', 'Début de session', [
          row('c-on', 'Résumé du dépôt', 'Claude démarre en connaissant la branche, les modifications et les derniers commits',
            toggle('c-on-t', sc.enabled, v => set(c => ({ ...c, sessionContext: { ...c.sessionContext, enabled: v } })))),
          row('c-n', 'Commits inclus', undefined,
            pick('c-n-s', String(sc.commits), ['3', '5', '10', '20'].map(v => ({ value: v, label: v })), v => set(c => ({ ...c, sessionContext: { ...c.sessionContext, commits: Number(v) } }))), !sc.enabled),
        ]),
        card('statusline', 'Statusline du terminal', [
          row('icons', 'Icônes', 'Nerd Font si ta police de terminal en a une',
            segmented('icons', kit.statusline.icons, [
              { value: 'unicode', label: 'Unicode' },
              { value: 'nerd', label: 'Nerd Font' },
              { value: 'ascii', label: 'ASCII' },
            ], v => set(c => ({ ...c, statusline: { ...c.statusline, icons: v } })))),
        ]),
      ],

      streamdeck: () => {
        if (!sd) return card('sd-wait', 'Stream Deck', <Text dimColor>Recherche de l'app Stream Deck…</Text>)
        const isUpToDate = sd.installed && sd.installedVersion === sd.bundledVersion
        const statusText = !sd.appFound
          ? 'App Stream Deck non trouvée'
          : sd.installed
            ? isUpToDate ? `Plugin installé · v${sd.installedVersion}` : `Mise à jour disponible · v${sd.installedVersion} → v${sd.bundledVersion}`
            : 'Plugin pas encore installé'
        const statusColor = !sd.appFound ? ORANGE : sd.installed && isUpToDate ? GREEN : YELLOW
        return [
          card('sd-status', 'Stream Deck', [
            row('sd-state', statusText, sd.platform === 'other' ? "Stream Deck n'existe que sur macOS et Windows" : sd.appFound ? 'Les touches suivent ce que fait Claude, dans l\'app, VS Code ou le terminal' : 'Installe l\'app gratuite « Elgato Stream Deck », puis reviens ici',
              <Text key="dot" bold color={statusColor}>●</Text>),
            sd.message && <Text key="sd-msg" color={t.accent2}>{sd.message}</Text>,
            <Box key="sd-actions" flexDirection="row" gap={1} flexWrap="wrap">
              {!sd.installed && (
                <Button key="sd-install" label={sd.busy ? 'Installation…' : 'Installer le plugin'} variant="primary" dimColor={sd.busy || !sd.bundled}
                  onPress={() => (sd.busy ? undefined : installStreamDeck($))} />
              )}
              {sd.installed && !isUpToDate && (
                <Button key="sd-update" label={sd.busy ? 'Mise à jour…' : 'Mettre à jour'} variant="primary" onPress={() => (sd.busy ? undefined : installStreamDeck($))} />
              )}
              {sd.appFound && <Button key="sd-open" label="Ouvrir Stream Deck" onPress={() => openStreamDeckApp($)} />}
              <Button key="sd-refresh" label="Vérifier" dimColor onPress={() => detectStreamDeck($)} />
              {sd.installed && <Button key="sd-remove" label="Désinstaller" dimColor onPress={() => uninstallStreamDeck($)} />}
            </Box>,
          ]),
          card('sd-howto', 'Ajouter des touches', [
            <Text key="h1">1. Ouvre l'app Stream Deck.</Text>,
            <Text key="h2">2. Dans la liste des actions à droite, ouvre la catégorie « Claude Kit ».</Text>,
            <Text key="h3">3. Glisse une action sur une touche : Limite 5 h, Limite semaine, Contexte, Coût, Git, Statut, Vue d'ensemble…</Text>,
            <Text key="h4">4. Clique sur la touche pour régler son style, sa couleur et la session suivie.</Text>,
          ], 'Chaque touche se règle dans l\'app Stream Deck'),
          card('sd-data', 'Données', [
            row('sd-publish', 'Publier pour le Stream Deck', 'Chaque session écrit son état (contexte, coût, git) dans claude-kit/sessions/',
              toggle('sd-publish-t', kit.streamdeck.publish, v => set(c => ({ ...c, streamdeck: { ...c.streamdeck, publish: v } })))),
            row('sd-theme', 'Couleurs', 'Les touches réglées sur « Thème de claude-kit » suivent l\'onglet Couleurs', <Text key="sw" color={st.accent}>●</Text>),
            !sd.installed && sd.bundled && row('sd-file', 'Installation manuelle', sd.bundledFile, <Text key="m" dimColor>double-clic</Text>),
          ]),
        ]
      },

      about: () => [
        card('about', 'claude-kit', [
          <Text key="desc">Personnalisation de Claude Code : bande, statusline, garde-fous, notifications, skills et agents.</Text>,
          row('file', 'Fichier de réglages', configPath || '…', <Text key="file-ok" color={GREEN}>enregistré auto</Text>),
          Link ? <Link key="repo" href={REPO_URL} label="Code source et documentation" /> : <Text key="repo">{REPO_URL}</Text>,
          <Text key="cmd" dimColor size="footnote">Ouvrir ces réglages : /kit · un onglet directement : /kit notifications, /kit sécurité, /kit streamdeck…</Text>,
        ]),
        card('updates', 'Mises à jour', (() => {
          const u = upd
          const status = !u || !u.installed
            ? 'Version inconnue : relance « node install.js »'
            : u.busy
              ? u.message || 'En cours…'
              : u.state === 'available'
                ? `Version ${u.latest} disponible`
                : u.state === 'installed' && u.installedAt > sessionStartedAt
                  ? `Version ${u.installed} installée · redémarre Claude pour tout charger`
                  : u.state === 'error'
                    ? u.message || 'Dernière vérification en échec'
                    : 'À jour'
          const color = !u ? t.muted : u.state === 'available' ? YELLOW : u.state === 'error' ? ORANGE : GREEN
          return [
            row('u-version', `claude-kit ${u?.installed || '?'}`, u?.checkedAt ? `Dernière vérification ${formatAgo(Date.now() - u.checkedAt)}` : 'Pas encore vérifié',
              <Text key="u-dot" bold color={color}>●</Text>),
            <Text key="u-status" color={color}>{status}</Text>,
            ...(u && u.state === 'available' && u.notes.length
              ? [<Text key="u-notes-t" bold>Nouveautés de la {u.latest}</Text>, ...u.notes.map((n, i) => <Text key={`u-n-${i}`} dimColor>• {n}</Text>)]
              : []),
            <Box key="u-actions" flexDirection="row" gap={1} flexWrap="wrap">
              {u?.state === 'available' && (
                <Button key="u-now" label={u.busy ? 'Mise à jour…' : `Mettre à jour vers ${u.latest}`} variant="primary" onPress={() => runUpdater($, '--now')} />
              )}
              <Button key="u-check" label={u?.busy ? 'Vérification…' : 'Vérifier maintenant'} dimColor onPress={() => runUpdater($, '--check')} />
            </Box>,
            row('u-mode', 'Mises à jour automatiques', kit.updates.mode === 'auto'
              ? 'Installées toutes seules à l\'ouverture de Claude (réglages conservés)'
              : kit.updates.mode === 'notify' ? 'Une pastille te prévient dans la bande' : 'Aucune vérification',
              segmented('u-mode-s', kit.updates.mode, [
                { value: 'auto', label: 'Auto' },
                { value: 'notify', label: 'Me prévenir' },
                { value: 'off', label: 'Désactivé' },
              ], v => set(c => ({ ...c, updates: { ...c.updates, mode: v } })))),
            row('u-sd', 'Mettre aussi à jour le Stream Deck', 'L\'app Stream Deck est relancée quelques secondes',
              toggle('u-sd-t', kit.updates.streamdeck, v => set(c => ({ ...c, updates: { ...c.updates, streamdeck: v } }))), kit.updates.mode === 'off'),
            <Text key="u-src" dimColor size="footnote">Source : github.com/{kit.updates.repo} ({kit.updates.branch})</Text>,
          ]
        })()),
        card('reset', 'Réinitialiser', [
          row('reset-band', 'Bande et couleurs', 'Ordre, style, thème et nom', <Button key="rb" label="Réinitialiser" dimColor onPress={() => set(c => ({ ...c, band: DEFAULT_CONFIG.band }))} />),
          row('reset-all', 'Tous les réglages', 'Bande, notifications, sécurité, automatisations', <Button key="ra" label="Tout réinitialiser" dimColor onPress={() => set(() => DEFAULT_CONFIG)} />),
        ]),
      ],
    }

    return (
      <Box flexDirection="column" gap={1}>
        {tabsBar}
        {body[tab]()}
        <Box key="footer" flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor size="footnote">Les changements s'appliquent tout de suite</Text>
          <Button key="close" label="Fermer" variant="primary" onPress={() => $.ui.close({ id: PANE_ID })} />
        </Box>
      </Box>
    )
  })
}
