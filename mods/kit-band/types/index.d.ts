export type Limit = {
  percent: number
  /** % d'avance (+) ou de retard (-) sur le rythme linéaire de la fenêtre */
  pace?: number
  resetsInMs?: number
  resetsAtMs?: number
  /** projection : dans combien de temps la limite sera atteinte au rythme actuel */
  emptyInMs?: number
  emptyAtMs?: number
  /** semaine : % encore disponible par jour restant */
  perDay?: number
  /** âge de la lecture (0 = lue dans cette session à l'instant) */
  ageMs: number
  /** la fenêtre a été remise à zéro depuis la lecture */
  isReset: boolean
}

export type Git = {
  branch: string
  staged: number
  modified: number
  untracked: number
  conflicts: number
  ahead: number
  behind: number
  added: number
  removed: number
  lastCommitAgeMs?: number
}

export type Usage = {
  model: string
  cost: number
  elapsedMs: number
  turns: number
  tzOffsetMin?: number
  context?: { percent: number; tokens?: number; window: number }
  session?: Limit
  week?: Limit
  spend?: Limit
  git: Git | null
}

export type Turn = { seconds: number; tools: number }

export type ElementId = 'brand' | 'five-hour' | 'week' | 'spend' | 'ctx' | 'cost' | 'git' | 'turn' | 'model'

/** Réglages de la bande (section « band » de claude-kit/config.json) */
export type Settings = {
  order: ElementId[]
  hidden: ElementId[]
  /** une ligne ou deux lignes (limites au-dessus) */
  layout: 'one' | 'two'
  /** arrondi · carré · contour · texte seul */
  chip: 'round' | 'pill' | 'outline' | 'plain'
  preset: string
  accent: string
  accent2: string
  brandLabel: string
  showPace: boolean
  showResetClock: boolean
}

/** Tout le fichier claude-kit/config.json (partagé avec les hooks et la statusline) */
export type KitConfig = {
  version: number
  general: { currency: 'USD' | 'EUR'; usdToEur: number; budgetPerSession: number }
  band: Settings
  notifications: {
    enabled: boolean
    onStop: boolean
    onPermission: boolean
    minDurationSec: number
    sound: boolean
    soundName: string
    quietHours: { enabled: boolean; start: number; end: number }
  }
  guard: { enabled: boolean; blockDangerous: boolean; askRisky: boolean; protectSecrets: boolean; log: boolean }
  format: { enabled: boolean; web: boolean; python: boolean; go: boolean; rust: boolean }
  sessionContext: { enabled: boolean; commits: number }
  streamdeck: { publish: boolean }
  updates: { mode: 'auto' | 'notify' | 'off'; repo: string; branch: string; intervalHours: number; streamdeck: boolean }
  statusline: { icons: 'nerd' | 'unicode' | 'ascii'; barWidth: number; show: Record<string, boolean> }
}

export type Tab = 'band' | 'look' | 'notifications' | 'security' | 'automation' | 'streamdeck' | 'about'

/** État des mises à jour (claude-kit/update.json écrit par hooks/update.js, + version.json) */
export type UpdateState = {
  installed: string
  latest: string
  state: 'up-to-date' | 'available' | 'updating' | 'installed' | 'error' | 'unknown'
  notes: string[]
  checkedAt: number
  installedAt: number
  message: string
  busy: boolean
}

/** Ce que l'onglet Stream Deck sait de la machine */
export type StreamDeckState = {
  platform: 'mac' | 'windows' | 'other'
  appFound: boolean
  pluginsDir: string
  installed: boolean
  installedVersion: string
  bundled: boolean
  bundledVersion: string
  bundledFile: string
  busy: boolean
  message: string
  checkedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'kit-band': {
      usage: Usage | null
      lastTurn: Turn | null
      config: KitConfig | null
      configPath: string
      tab: Tab
      hexDraft: string
      sd: StreamDeckState | null
      update: UpdateState | null
    }
  }
}
