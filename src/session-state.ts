export type AnalysisKind = 'metric' | 'rank' | 'share' | 'trend' | 'extrema' | 'attribution' | 'other'

export interface DataBindings {
  metric?: string
  timeRange?: string
  grain?: string
  filters?: string
  analysisKind?: AnalysisKind
  lastSql?: string
  sourceId?: string
}

const described = new Map<string, Set<string>>()
const bindings = new Map<string, DataBindings>()

function asId(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Live Agent uses `id` / `session.id`; tests may pass `{ sessionId }`. */
export function sessionIdFromAgent(agent: unknown): string {
  if (!agent || typeof agent !== 'object') return ''
  const rec = agent as {
    sessionId?: unknown
    id?: unknown
    session?: { id?: unknown }
  }
  return asId(rec.sessionId) ?? asId(rec.id) ?? asId(rec.session?.id) ?? ''
}

export function sessionKeyFromAgent(agent: unknown): string {
  const sessionId = sessionIdFromAgent(agent)
  return sessionId === '' ? 'session:unknown' : `session:${sessionId}`
}

export function markDescribed(sessionKey: string, table: string): void {
  const name = table.trim()
  if (name === '') return
  const set = described.get(sessionKey) ?? new Set<string>()
  set.add(name)
  described.set(sessionKey, set)
}

export function getDescribed(sessionKey: string): Set<string> {
  return described.get(sessionKey) ?? new Set<string>()
}

export function isDescribed(sessionKey: string, table: string): boolean {
  const set = described.get(sessionKey)
  if (set === undefined) return false
  if (set.has(table)) return true
  const lower = table.toLowerCase()
  for (const name of set) {
    if (name.toLowerCase() === lower) return true
  }
  return false
}

export function setBindings(sessionKey: string, patch: DataBindings): void {
  const current = bindings.get(sessionKey) ?? {}
  bindings.set(sessionKey, { ...current, ...patch })
}

export function getBindings(sessionKey: string): DataBindings | undefined {
  return bindings.get(sessionKey)
}

export function formatBindings(sessionKey: string): string {
  const current = bindings.get(sessionKey)
  if (current === undefined) return ''
  const lines: string[] = []
  if (current.metric) lines.push(`- metric: ${current.metric}`)
  if (current.timeRange) lines.push(`- time: ${current.timeRange}`)
  if (current.grain) lines.push(`- grain: ${current.grain}`)
  if (current.filters) lines.push(`- filters: ${current.filters}`)
  if (current.analysisKind) lines.push(`- analysisKind: ${current.analysisKind}`)
  if (current.sourceId) lines.push(`- sourceId: ${current.sourceId}`)
  if (current.lastSql) lines.push(`- lastSql: ${current.lastSql}`)
  if (lines.length === 0) return ''
  return `Current data-mode bindings for this session:\n${lines.join('\n')}`
}
