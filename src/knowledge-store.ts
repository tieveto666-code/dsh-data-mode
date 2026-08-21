import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATA_MODE_DIR } from './paths.ts'
import { MAX_KNOWLEDGE_ENTRIES, MAX_KNOWLEDGE_KEY, MAX_KNOWLEDGE_VALUE } from './knowledge-limits.ts'

export { MAX_KNOWLEDGE_ENTRIES, MAX_KNOWLEDGE_KEY, MAX_KNOWLEDGE_VALUE } from './knowledge-limits.ts'

export interface KnowledgeEntry {
  id: string
  key: string
  value: string
}

export interface KnowledgeDoc {
  sourceId: string
  entries: KnowledgeEntry[]
}

function knowledgeDir(dshHome: string): string {
  return join(dshHome, DATA_MODE_DIR, 'knowledge')
}

export function knowledgeFileName(sourceId: string): string {
  const safe = sourceId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return `${safe || 'source'}.json`
}

function knowledgePath(dshHome: string, sourceId: string): string {
  return join(knowledgeDir(dshHome), knowledgeFileName(sourceId))
}

function asEntry(value: unknown): KnowledgeEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const rec = value as { id?: unknown; key?: unknown; value?: unknown }
  if (typeof rec.id !== 'string' || rec.id.trim() === '') return undefined
  if (typeof rec.key !== 'string' || rec.key.trim() === '') return undefined
  if (typeof rec.value !== 'string' || rec.value.trim() === '') return undefined
  return { id: rec.id.trim(), key: rec.key.trim(), value: rec.value.trim() }
}

function parseDoc(text: string, sourceId: string): KnowledgeDoc {
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { sourceId, entries: [] }
  }
  const raw = (parsed as { entries?: unknown }).entries
  const entries: KnowledgeEntry[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const entry = asEntry(item)
      if (entry === undefined || seen.has(entry.id)) continue
      seen.add(entry.id)
      entries.push(entry)
      if (entries.length >= MAX_KNOWLEDGE_ENTRIES) break
    }
  }
  return { sourceId, entries }
}

function emptyDoc(sourceId: string): KnowledgeDoc {
  return { sourceId, entries: [] }
}

export function loadKnowledgeSync(dshHome: string, sourceId: string): KnowledgeEntry[] {
  if (sourceId.trim() === '') return []
  try {
    const text = readFileSync(knowledgePath(dshHome, sourceId), 'utf8')
    return parseDoc(text, sourceId).entries
  } catch {
    return []
  }
}

export async function loadKnowledge(dshHome: string, sourceId: string): Promise<KnowledgeDoc> {
  if (sourceId.trim() === '') return emptyDoc(sourceId)
  try {
    const text = await readFile(knowledgePath(dshHome, sourceId), 'utf8')
    return parseDoc(text, sourceId)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return emptyDoc(sourceId)
    throw error
  }
}

async function saveDoc(dshHome: string, doc: KnowledgeDoc): Promise<KnowledgeDoc> {
  await mkdir(knowledgeDir(dshHome), { recursive: true, mode: 0o700 })
  await writeFile(
    knowledgePath(dshHome, doc.sourceId),
    `${JSON.stringify({ sourceId: doc.sourceId, entries: doc.entries }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  return doc
}

export function normalizeKnowledgeField(label: '键' | '值', raw: string, max: number): string {
  const text = label === '键' ? raw.replace(/\s+/g, ' ').trim() : raw.trim()
  if (text === '') throw new Error(`${label}不能为空`)
  if (text.length > max) throw new Error(`${label}不能超过 ${max} 个字符`)
  return text
}

export async function addKnowledgeEntry(
  dshHome: string,
  sourceId: string,
  input: { key: string; value: string },
): Promise<KnowledgeDoc> {
  const key = normalizeKnowledgeField('键', input.key, MAX_KNOWLEDGE_KEY)
  const value = normalizeKnowledgeField('值', input.value, MAX_KNOWLEDGE_VALUE)
  const doc = await loadKnowledge(dshHome, sourceId)
  if (doc.entries.length >= MAX_KNOWLEDGE_ENTRIES) {
    throw new Error(`每个数据源最多 ${MAX_KNOWLEDGE_ENTRIES} 条知识`)
  }
  doc.entries.push({ id: randomUUID(), key, value })
  return saveDoc(dshHome, doc)
}

export async function updateKnowledgeEntry(
  dshHome: string,
  sourceId: string,
  input: { id: string; key: string; value: string },
): Promise<KnowledgeDoc> {
  const id = input.id.trim()
  if (id === '') throw new Error('需要知识 id')
  const key = normalizeKnowledgeField('键', input.key, MAX_KNOWLEDGE_KEY)
  const value = normalizeKnowledgeField('值', input.value, MAX_KNOWLEDGE_VALUE)
  const doc = await loadKnowledge(dshHome, sourceId)
  const index = doc.entries.findIndex(entry => entry.id === id)
  if (index < 0) throw new Error('找不到这条知识')
  doc.entries[index] = { id, key, value }
  return saveDoc(dshHome, doc)
}

export async function removeKnowledgeEntry(
  dshHome: string,
  sourceId: string,
  id: string,
): Promise<KnowledgeDoc> {
  return removeKnowledgeEntries(dshHome, sourceId, [id])
}

export async function removeKnowledgeEntries(
  dshHome: string,
  sourceId: string,
  ids: readonly string[],
): Promise<KnowledgeDoc> {
  const wanted = [...new Set(ids.map(id => id.trim()).filter(id => id !== ''))]
  if (wanted.length === 0) throw new Error('需要知识 id')
  const doc = await loadKnowledge(dshHome, sourceId)
  const drop = new Set(wanted)
  const next = doc.entries.filter(entry => !drop.has(entry.id))
  if (next.length === doc.entries.length) throw new Error('找不到这条知识')
  doc.entries = next
  return saveDoc(dshHome, doc)
}

export async function deleteKnowledge(dshHome: string, sourceId: string): Promise<void> {
  if (sourceId.trim() === '') return
  await rm(knowledgePath(dshHome, sourceId), { force: true })
}
