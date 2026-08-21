import type { IncomingMessage, ServerResponse } from 'node:http'
import { DEFAULT_PREVIEW_LIMIT, resolveDshHome, resolveWorkspaceRoot } from './paths.ts'
import {
  connectDatabase, listSourceViews, removeSource, selectSource, uploadTable,
} from './catalog/store.ts'
import { loadCatalog } from './catalog/load-catalog.ts'
import type { CatalogLoadOptions, ConnectDatabaseInput } from './catalog/types.ts'
import { inspectSource } from './source-runtime.ts'
import { withTimeout } from './with-timeout.ts'
import { DATA_MODE_ONLY, isDataModePreset, resolveLivePreset } from './data-mode-gate.ts'
import {
  addKnowledgeEntry, loadKnowledge, removeKnowledgeEntries, updateKnowledgeEntry,
} from './knowledge-store.ts'

export const CATALOG_API_PREFIX = '/api/dsh-data-mode'

export interface CatalogHttpDeps {
  dshHome: string
  resolveWorkspace(workspaceId: string | undefined): string
  resolvePreset(sessionId: string): string | undefined
}

const PREVIEW_TIMEOUT_MS = 15_000
const BODY_TIMEOUT_MS = 10_000

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(json)
}

function readBody(req: IncomingMessage): Promise<string> {
  return withTimeout(new Promise((resolve, reject) => {
    if (req.readableEnded) {
      resolve('')
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 24 * 1024 * 1024) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  }), BODY_TIMEOUT_MS, '读取请求超时')
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const text = await readBody(req)
  if (text.trim() === '') return {}
  const value = JSON.parse(text) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('JSON body must be an object')
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function optionsFrom(deps: CatalogHttpDeps, body: Record<string, unknown>): CatalogLoadOptions {
  return {
    dshHome: deps.dshHome,
    workspaceRoot: deps.resolveWorkspace(asString(body.workspaceId)),
  }
}

function pathnameOf(req: IncomingMessage): string {
  const host = req.headers.host ?? '127.0.0.1'
  const url = new URL(req.url ?? '/', `http://${host}`)
  return url.pathname.replace(/\/$/, '') || '/'
}

function actionOf(path: string): string {
  if (path === CATALOG_API_PREFIX) return ''
  const prefix = `${CATALOG_API_PREFIX}/`
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : path.replace(/^\//, '')
  return rest.split('/')[0] ?? ''
}

function queryOf(req: IncomingMessage): URLSearchParams {
  const host = req.headers.host ?? '127.0.0.1'
  return new URL(req.url ?? '/', `http://${host}`).searchParams
}

function failStatus(error: unknown): number {
  const text = error instanceof Error ? error.message : String(error)
  if (text.includes(DATA_MODE_ONLY)) return 403
  if (
    text.includes('找不到')
    || text.includes('请填写')
    || text.includes('仅支持')
    || text.includes('空')
    || text.includes('不能删除')
    || text.includes('不能超过')
    || text.includes('最多')
    || text.includes('需要')
  ) return 400
  return 500
}

async function requireKnownSource(options: CatalogLoadOptions, sourceId: string): Promise<void> {
  if (sourceId === '') throw new Error('需要 sourceId')
  const catalog = await loadCatalog(options)
  if (!catalog.sources.some(source => source.id === sourceId)) {
    throw new Error(`找不到数据源 ${sourceId}`)
  }
}

function allowDataMode(sessionId: string, deps: CatalogHttpDeps, res: ServerResponse): boolean {
  if (!isDataModePreset(deps.resolvePreset(sessionId))) {
    send(res, 403, { error: DATA_MODE_ONLY })
    return false
  }
  return true
}

export async function handleCatalogHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CatalogHttpDeps,
): Promise<void> {
  const path = pathnameOf(req)
  const action = actionOf(path)
  const method = (req.method ?? 'GET').toUpperCase()
  try {
    if (method === 'GET' && action === 'state') {
      const query = queryOf(req)
      const sessionId = query.get('sessionId') ?? ''
      if (!allowDataMode(sessionId, deps, res)) return
      const workspaceId = query.get('workspaceId') ?? undefined
      const options = {
        dshHome: deps.dshHome,
        workspaceRoot: deps.resolveWorkspace(workspaceId === '' ? undefined : workspaceId),
      }
      const state = await listSourceViews(options, sessionId)
      send(res, 200, {
        ...state,
        engines: [
          { id: 'postgres', label: 'PostgreSQL' },
          { id: 'mysql', label: 'MySQL' },
          { id: 'sqlite', label: 'SQLite' },
        ],
        fileTypes: ['.csv', '.xlsx'],
      })
      return
    }

    if (action === 'preview' && (method === 'GET' || method === 'POST')) {
      let sourceId = ''
      let sessionId = ''
      let workspaceId: string | undefined
      let table: string | undefined
      let limit = DEFAULT_PREVIEW_LIMIT
      if (method === 'GET') {
        const query = queryOf(req)
        sourceId = query.get('sourceId') ?? ''
        sessionId = query.get('sessionId') ?? ''
        workspaceId = query.get('workspaceId') ?? undefined
        table = query.get('table') ?? undefined
        const limitRaw = query.get('limit')
        if (limitRaw !== null && limitRaw !== '') limit = Number(limitRaw)
      } else {
        const body = await readJson(req)
        sourceId = asString(body.sourceId) ?? ''
        sessionId = asString(body.sessionId) ?? ''
        workspaceId = asString(body.workspaceId)
        table = asString(body.table)
        if (typeof body.limit === 'number') limit = body.limit
      }
      if (!allowDataMode(sessionId, deps, res)) return
      if (sourceId === '') {
        send(res, 400, { error: '需要 sourceId' })
        return
      }
      const inspected = await withTimeout(inspectSource({
        dshHome: deps.dshHome,
        workspaceRoot: deps.resolveWorkspace(workspaceId === '' ? undefined : workspaceId),
      }, sourceId, table === '' ? undefined : table, Number.isFinite(limit) ? limit : DEFAULT_PREVIEW_LIMIT), PREVIEW_TIMEOUT_MS, '预览超时，请稍后重试')
      send(res, 200, inspected)
      return
    }

    if (method === 'GET' && action === 'knowledge') {
      const query = queryOf(req)
      const sessionId = query.get('sessionId') ?? ''
      if (!allowDataMode(sessionId, deps, res)) return
      const workspaceId = query.get('workspaceId') ?? undefined
      const sourceId = query.get('sourceId') ?? ''
      const options = {
        dshHome: deps.dshHome,
        workspaceRoot: deps.resolveWorkspace(workspaceId === '' ? undefined : workspaceId),
      }
      await requireKnownSource(options, sourceId)
      send(res, 200, await loadKnowledge(options.dshHome, sourceId))
      return
    }

    if (method !== 'POST') {
      send(res, 405, { error: 'method not allowed' })
      return
    }

    const body = await readJson(req)
    const options = optionsFrom(deps, body)
    const sessionId = asString(body.sessionId) ?? ''
    if (!allowDataMode(sessionId, deps, res)) return

    if (action === 'connect') {
      const engine = asString(body.engine)
      if (engine !== 'postgres' && engine !== 'mysql' && engine !== 'sqlite') {
        send(res, 400, { error: 'engine 必须是 postgres、mysql 或 sqlite' })
        return
      }
      const input: ConnectDatabaseInput = {
        engine,
        label: asString(body.label) ?? '',
        host: asString(body.host),
        port: typeof body.port === 'number' ? body.port : undefined,
        database: asString(body.database),
        user: asString(body.user),
        password: typeof body.password === 'string' ? body.password : undefined,
        sqlitePath: asString(body.sqlitePath),
        ssl: body.ssl === true,
      }
      const source = await connectDatabase(options, input)
      if (sessionId !== '') await selectSource(options, sessionId, source.id)
      const state = await listSourceViews(options, sessionId)
      send(res, 200, state)
      return
    }

    if (action === 'upload') {
      const filename = asString(body.filename)
      const base64 = asString(body.base64)
      if (filename === undefined || base64 === undefined) {
        send(res, 400, { error: '需要 filename 和 base64' })
        return
      }
      const bytes = Buffer.from(base64, 'base64')
      const source = await uploadTable(options, {
        filename,
        bytes,
        label: asString(body.label),
      })
      if (sessionId !== '') await selectSource(options, sessionId, source.id)
      const state = await listSourceViews(options, sessionId)
      send(res, 200, state)
      return
    }

    if (action === 'select') {
      const sourceId = asString(body.sourceId) ?? null
      await selectSource(options, sessionId, sourceId)
      send(res, 200, await listSourceViews(options, sessionId))
      return
    }

    if (action === 'remove') {
      const sourceId = asString(body.sourceId)
      if (sourceId === undefined) {
        send(res, 400, { error: '需要 sourceId' })
        return
      }
      await removeSource(options, sourceId)
      const selected = (await listSourceViews(options, sessionId)).selectedSourceId
      if (selected === sourceId) await selectSource(options, sessionId, null)
      send(res, 200, await listSourceViews(options, sessionId))
      return
    }

    if (action === 'knowledge') {
      const sourceId = asString(body.sourceId) ?? ''
      await requireKnownSource(options, sourceId)
      send(res, 200, await addKnowledgeEntry(options.dshHome, sourceId, {
        key: asString(body.key) ?? '',
        value: typeof body.value === 'string' ? body.value : '',
      }))
      return
    }

    if (action === 'knowledge-update') {
      const sourceId = asString(body.sourceId) ?? ''
      await requireKnownSource(options, sourceId)
      send(res, 200, await updateKnowledgeEntry(options.dshHome, sourceId, {
        id: asString(body.id) ?? '',
        key: asString(body.key) ?? '',
        value: typeof body.value === 'string' ? body.value : '',
      }))
      return
    }

    if (action === 'knowledge-remove') {
      const sourceId = asString(body.sourceId) ?? ''
      await requireKnownSource(options, sourceId)
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string')
        : [asString(body.id) ?? '']
      send(res, 200, await removeKnowledgeEntries(options.dshHome, sourceId, ids))
      return
    }

    send(res, 404, { error: 'not found' })
  } catch (error) {
    send(res, failStatus(error), { error: error instanceof Error ? error.message : String(error) })
  }
}

export function createCatalogHttpDeps(ctx: {
  get?(name: string): unknown
}): CatalogHttpDeps {
  return {
    dshHome: resolveDshHome(),
    resolveWorkspace(workspaceId) {
      if (workspaceId) {
        const registry = ctx.get?.('workspaceRegistry') as
          | { get?(id: string): { path?: string } | undefined }
          | undefined
        const path = registry?.get?.(workspaceId)?.path
        if (typeof path === 'string' && path !== '') return path
      }
      return resolveWorkspaceRoot()
    },
    resolvePreset(sessionId) {
      const sessions = ctx.get?.('sessions') as { get?(id: string): unknown } | undefined
      return resolveLivePreset(id => sessions?.get?.(id), sessionId)
    },
  }
}
