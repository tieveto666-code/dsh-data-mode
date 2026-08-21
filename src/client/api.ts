export const API_PREFIX = '/api/dsh-data-mode'

export type EngineId = 'postgres' | 'mysql' | 'sqlite'
export type SourceOrigin = 'workspace' | 'upload' | 'database'

export interface SourceView {
  id: string
  label: string
  type: string
  origin: SourceOrigin
  detail?: string
  selected: boolean
  available: boolean
  note?: string
}

export interface SourceState {
  sources: SourceView[]
  selectedSourceId?: string
  engines?: { id: EngineId; label: string }[]
  fileTypes?: string[]
}

export interface PreviewPayload {
  sourceId: string
  label: string
  tables: string[]
  preview?: {
    table: string
    columns: string[]
    rows: unknown[][]
    rowCount: number
    sql: string
  }
}

export interface KnowledgeEntry {
  id: string
  key: string
  value: string
}

export interface KnowledgeDoc {
  sourceId: string
  entries: KnowledgeEntry[]
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

async function parse(res: Response): Promise<SourceState> {
  return parseJson<SourceState>(res)
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export async function fetchState(sessionId: string, workspaceId?: string): Promise<SourceState> {
  return parse(await fetch(`${API_PREFIX}/state${qs({ sessionId, workspaceId })}`, { credentials: 'same-origin' }))
}

export async function fetchPreview(input: {
  sourceId: string
  sessionId: string
  workspaceId?: string
  table?: string
  limit?: number
  signal?: AbortSignal
}): Promise<PreviewPayload> {
  return parseJson<PreviewPayload>(await fetch(`${API_PREFIX}/preview`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      table: input.table,
      limit: input.limit,
    }),
    signal: input.signal,
  }))
}

export async function connectDatabase(input: {
  sessionId: string
  workspaceId?: string
  engine: EngineId
  label: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  sqlitePath?: string
  ssl?: boolean
}): Promise<SourceState> {
  return parse(await fetch(`${API_PREFIX}/connect`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function uploadTable(input: {
  sessionId: string
  workspaceId?: string
  filename: string
  base64: string
  label?: string
}): Promise<SourceState> {
  return parse(await fetch(`${API_PREFIX}/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function selectSource(input: {
  sessionId: string
  workspaceId?: string
  sourceId: string | null
}): Promise<SourceState> {
  return parse(await fetch(`${API_PREFIX}/select`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function removeSource(input: {
  sessionId: string
  workspaceId?: string
  sourceId: string
}): Promise<SourceState> {
  return parse(await fetch(`${API_PREFIX}/remove`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function fetchKnowledge(input: {
  sourceId: string
  sessionId: string
  workspaceId?: string
}): Promise<KnowledgeDoc> {
  return parseJson<KnowledgeDoc>(await fetch(`${API_PREFIX}/knowledge${qs({
    sourceId: input.sourceId,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
  })}`, { credentials: 'same-origin' }))
}

export async function addKnowledge(input: {
  sessionId: string
  workspaceId?: string
  sourceId: string
  key: string
  value: string
}): Promise<KnowledgeDoc> {
  return parseJson<KnowledgeDoc>(await fetch(`${API_PREFIX}/knowledge`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function updateKnowledge(input: {
  sessionId: string
  workspaceId?: string
  sourceId: string
  id: string
  key: string
  value: string
}): Promise<KnowledgeDoc> {
  return parseJson<KnowledgeDoc>(await fetch(`${API_PREFIX}/knowledge-update`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function removeKnowledge(input: {
  sessionId: string
  workspaceId?: string
  sourceId: string
  id?: string
  ids?: string[]
}): Promise<KnowledgeDoc> {
  return parseJson<KnowledgeDoc>(await fetch(`${API_PREFIX}/knowledge-remove`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('failed to read file'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('failed to read file'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}
