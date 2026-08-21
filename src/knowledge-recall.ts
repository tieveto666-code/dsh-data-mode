import type { KnowledgeEntry } from './knowledge-store.ts'

const K1 = 1.5
const B = 0.75
const MAX_KEYS = 8
const MAX_HITS = 16
const RELATIVE = 0.4
const ABS_MIN = 0.55

const STOP = new Set([
  '的',   '了', '吗', '呢', '啊', '吧', '是', '和', '与', '及', '或', '在', '有', '被', '把',
  '这个', '那个', '什么', '怎么', '如何', '多少', '哪个', '哪些', '请问', '帮我', '一下',
  '查询', '看看', '告诉', '我', '你', '同比', '环比', '今年', '去年', '本月',
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'is', 'are', 'how', 'what',
  'please', 'show', 'me', 'many', 'much',
])

export function tokenize(text: string): string[] {
  const source = text.normalize('NFKC').toLowerCase()
  const tokens: string[] = []
  let latin = ''
  let cjk = ''
  const flushLatin = (): void => {
    if (latin !== '') {
      if (!STOP.has(latin)) tokens.push(latin)
      latin = ''
    }
  }
  const flushCjk = (): void => {
    if (cjk === '') return
    if (cjk.length >= 2 && !STOP.has(cjk)) tokens.push(cjk)
    for (const ch of cjk) {
      if (!STOP.has(ch)) tokens.push(ch)
    }
    for (let i = 0; i < cjk.length - 1; i += 1) {
      const gram = cjk.slice(i, i + 2)
      if (!STOP.has(gram)) tokens.push(gram)
    }
    cjk = ''
  }
  for (const ch of source) {
    if (/[a-z0-9_]/.test(ch)) {
      flushCjk()
      latin += ch
      continue
    }
    if (/[\u4e00-\u9fff]/.test(ch)) {
      flushLatin()
      cjk += ch
      continue
    }
    flushLatin()
    flushCjk()
  }
  flushLatin()
  flushCjk()
  return tokens
}

function termFreq(tokens: readonly string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1)
  return freq
}

function idf(nqi: number, nDocs: number): number {
  return Math.log(((nDocs - nqi + 0.5) / (nqi + 0.5)) + 1)
}

export interface KeyScore {
  key: string
  score: number
  overlap: number
  contained: boolean
}

export function scoreKeys(query: string, keys: readonly string[]): KeyScore[] {
  const queryTokens = tokenize(query)
  const queryTerms = new Set(queryTokens)
  const docs = keys.map(key => ({ key, tokens: tokenize(key), freq: termFreq(tokenize(key)) }))
  const nDocs = Math.max(docs.length, 1)
  const avgdl = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / nDocs
  const df = new Map<string, number>()
  for (const doc of docs) {
    for (const term of new Set(doc.tokens)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const qNorm = query.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
  return docs.map((doc) => {
    const keyNorm = doc.key.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
    const contained = keyNorm.length >= 2 && qNorm.includes(keyNorm)
    let overlap = 0
    for (const term of new Set(doc.tokens)) {
      if (queryTerms.has(term)) overlap += 1
    }
    let score = contained ? 8 : 0
    for (const term of queryTerms) {
      const f = doc.freq.get(term) ?? 0
      if (f === 0) continue
      const denom = f + K1 * (1 - B + B * (doc.tokens.length / Math.max(avgdl, 1)))
      score += idf(df.get(term) ?? 0, nDocs) * ((f * (K1 + 1)) / denom)
    }
    return { key: doc.key, score, overlap, contained }
  })
}

/**
 * 召回「符合」定义：
 * 1. 问句包含完整键（长度≥2）→ 必召回该键下全部条目
 * 2. 否则 BM25 打分；与问句至少 1 个非停用词重叠，且分数 ≥ max(0.55, 最高分×0.4)
 * 3. 最多 8 个键、16 条知识；同一键可有多条值，命中后全部带出
 */
export function recallKnowledge(query: string, entries: readonly KnowledgeEntry[]): KnowledgeEntry[] {
  const q = query.trim()
  if (q === '' || entries.length === 0) return []
  const byKey = new Map<string, KnowledgeEntry[]>()
  for (const entry of entries) {
    const group = byKey.get(entry.key) ?? []
    group.push(entry)
    byKey.set(entry.key, group)
  }
  const scored = scoreKeys(q, [...byKey.keys()]).sort((a, b) => b.score - a.score)
  const maxScore = scored[0]?.score ?? 0
  const threshold = Math.max(ABS_MIN, maxScore * RELATIVE)
  const picked: string[] = []
  const seen = new Set<string>()
  const take = (key: string): void => {
    if (seen.has(key) || picked.length >= MAX_KEYS) return
    seen.add(key)
    picked.push(key)
  }
  for (const row of scored) {
    if (row.contained) take(row.key)
  }
  for (const row of scored) {
    if (row.contained) continue
    if (row.overlap > 0 && row.score >= threshold) take(row.key)
  }
  const hits: KnowledgeEntry[] = []
  for (const key of picked) {
    const group = byKey.get(key)
    if (group === undefined) continue
    for (const entry of group) {
      hits.push(entry)
      if (hits.length >= MAX_HITS) return hits
    }
  }
  return hits
}

export function formatRecalledKnowledge(entries: readonly KnowledgeEntry[]): string {
  if (entries.length === 0) return ''
  const lines = entries.map(entry => `- ${entry.key}：${entry.value}`)
  return [
    'Business knowledge recalled for this question (BM25 match on knowledge keys). Treat these as the 口径 source of truth when writing SQL. They do not replace real table/column names — still describe_schema before run_sql.',
    ...lines,
  ].join('\n')
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string'
      ? (block as { text: string }).text
      : ''))
    .join('')
    .trim()
}

/**
 * Assemble runs before the current turn's user/message is appended.
 * Prefer the latest inbox insertion splice; fall back to the last user/message.
 */
export function userQueryFromAgent(agent: unknown): string {
  if (!agent || typeof agent !== 'object') return ''
  const events = (agent as { session?: { events?: unknown } }).session?.events
  if (!Array.isArray(events)) return ''
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (!event || typeof event !== 'object') continue
    const rec = event as { type?: unknown; data?: unknown }
    if (rec.type === 'user/message') {
      const text = contentText((rec.data as { content?: unknown } | undefined)?.content)
      if (text !== '') return text
      continue
    }
    if (rec.type === 'agent/inbox/spliced') {
      const inserted = (rec.data as { inserted?: unknown } | undefined)?.inserted
      if (!Array.isArray(inserted)) continue
      const texts = inserted.map(item => contentText((item as { content?: unknown } | undefined)?.content)).filter(Boolean)
      if (texts.length > 0) return texts.join('\n')
    }
  }
  return ''
}
