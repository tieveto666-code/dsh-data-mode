import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA_MODE_DIR } from '../paths.ts'
import { originOf, safeFileName, slugId } from './ids.ts'
import { DEMO_SQLITE_ID } from './demo-sqlite.ts'
import { DEMO_XLSX_ID } from './demo-xlsx.ts'
import { loadCatalog, loadRawCatalog, saveWorkspaceCatalog, withoutWorkspaceScan } from './load-catalog.ts'
import { deleteSecret, deleteUploadDir, writeSecret } from './secrets.ts'
import { readSelectedSourceId, writeSelectedSourceId } from './selection.ts'
import { deleteKnowledge } from '../knowledge-store.ts'
import type {
  CatalogLoadOptions, ConnectDatabaseInput, DataSourceRecord, DataSourceView, UploadTableInput,
} from './types.ts'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const UPLOAD_EXTENSIONS = new Set(['.csv', '.xlsx'])

const DEFAULT_PORTS = { postgres: 5432, mysql: 3306 } as const

export function uploadRelPath(sourceId: string, filename: string): string {
  return `.dsh/${DATA_MODE_DIR}/uploads/${sourceId}/${filename}`
}

function sourceDetail(source: DataSourceRecord): string | undefined {
  if (source.id === DEMO_SQLITE_ID) return '内置演示 · orders'
  if (source.id === DEMO_XLSX_ID) return '内置演示 · products'
  if (source.type === 'sqlite') return source.sqlitePath ?? source.uri
  if (source.type === 'postgres' || source.type === 'mysql') {
    const host = source.host ?? 'localhost'
    const port = source.port ?? DEFAULT_PORTS[source.type]
    const database = source.database ?? ''
    return database === '' ? `${host}:${port}` : `${host}:${port}/${database}`
  }
  if (source.files && source.files.length > 0) {
    return source.files.map(file => file.split('/').pop()).filter(Boolean).join(', ')
  }
  return undefined
}

function toView(source: DataSourceRecord, selectedId: string | undefined): DataSourceView {
  const origin = originOf(source.type, source.origin)
  return {
    id: source.id,
    label: source.label,
    type: source.type,
    origin,
    detail: sourceDetail(source),
    selected: selectedId === source.id,
    available: true,
  }
}

export async function listSourceViews(
  options: CatalogLoadOptions,
  sessionId: string,
): Promise<{ sources: DataSourceView[]; selectedSourceId?: string }> {
  const catalog = await loadCatalog(options)
  const selectedSourceId = await readSelectedSourceId(options.dshHome, sessionId)
  const known = new Set(catalog.sources.map(source => source.id))
  const selected = selectedSourceId !== undefined && known.has(selectedSourceId) ? selectedSourceId : undefined
  return {
    sources: catalog.sources.map(source => toView(source, selected)),
    selectedSourceId: selected,
  }
}

async function persistWithImplicit(options: CatalogLoadOptions, next: DataSourceRecord[]): Promise<void> {
  const raw = await loadRawCatalog(options)
  const sources = withoutWorkspaceScan(raw.sources)
  const byId = new Map(sources.map(source => [source.id, source]))
  byId.set(next[0]!.id, next[0]!)
  await saveWorkspaceCatalog(options, { sources: [...byId.values()] })
}

function requireLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed === '') throw new Error('请填写数据源名称')
  return trimmed
}

export async function connectDatabase(
  options: CatalogLoadOptions,
  input: ConnectDatabaseInput,
): Promise<DataSourceRecord> {
  const label = requireLabel(input.label)
  const id = slugId(input.engine, label)
  let record: DataSourceRecord
  if (input.engine === 'sqlite') {
    const sqlitePath = input.sqlitePath?.trim() ?? ''
    if (sqlitePath === '') throw new Error('请填写 SQLite 文件路径')
    record = {
      id,
      type: 'sqlite',
      label,
      origin: 'database',
      sqlitePath,
      readonly: true,
    }
  } else {
    const host = (input.host?.trim() || '127.0.0.1')
    const database = input.database?.trim() ?? ''
    if (database === '') throw new Error('请填写数据库名')
    const user = input.user?.trim() ?? ''
    if (user === '') throw new Error('请填写用户名')
    const port = input.port && input.port > 0 ? Math.floor(input.port) : DEFAULT_PORTS[input.engine]
    record = {
      id,
      type: input.engine,
      label,
      origin: 'database',
      host,
      port,
      database,
      user,
      ssl: input.ssl === true,
      credentialRef: `data-mode:${id}`,
      readonly: true,
    }
    if (input.password !== undefined && input.password !== '') {
      await writeSecret(options.dshHome, id, input.password)
    }
  }
  await persistWithImplicit(options, [record])
  return record
}

function fileKind(filename: string): '.csv' | '.xlsx' {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) return '.csv'
  if (lower.endsWith('.xlsx')) return '.xlsx'
  throw new Error('仅支持 .csv 和 .xlsx')
}

export async function uploadTable(
  options: CatalogLoadOptions,
  input: UploadTableInput,
): Promise<DataSourceRecord> {
  if (input.bytes.byteLength === 0) throw new Error('文件是空的')
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`文件不能超过 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`)
  }
  const filename = safeFileName(input.filename)
  fileKind(filename)
  const label = requireLabel(input.label?.trim() || filename.replace(/\.(csv|xlsx)$/i, ''))
  const id = slugId('upload', label)
  const rel = uploadRelPath(id, filename)
  const abs = join(options.workspaceRoot, rel)
  await mkdir(join(options.workspaceRoot, '.dsh', DATA_MODE_DIR, 'uploads', id), { recursive: true })
  await writeFile(abs, input.bytes)
  const record: DataSourceRecord = {
    id,
    type: 'duckdb-files',
    label,
    origin: 'upload',
    files: [rel],
    readonly: true,
  }
  await persistWithImplicit(options, [record])
  return record
}

export async function removeSource(options: CatalogLoadOptions, sourceId: string): Promise<void> {
  if (sourceId === DEMO_SQLITE_ID || sourceId === DEMO_XLSX_ID) throw new Error('内置示例数据不能删除')
  const raw = await loadRawCatalog(options)
  const catalog = raw.sources.length === 0 ? await loadCatalog(options) : raw
  const found = catalog.sources.find(source => source.id === sourceId)
  if (found === undefined) throw new Error(`找不到数据源 ${sourceId}`)
  const next = catalog.sources.filter(source => source.id !== sourceId)
  await saveWorkspaceCatalog(options, { sources: next })
  await deleteSecret(options.dshHome, sourceId)
  await deleteKnowledge(options.dshHome, sourceId)
  if (found.origin === 'upload' || (found.files && found.files.length > 0)) {
    await deleteUploadDir(options.workspaceRoot, sourceId)
  }
}

export async function selectSource(
  options: CatalogLoadOptions,
  sessionId: string,
  sourceId: string | null,
): Promise<void> {
  if (sourceId !== null && sourceId !== '') {
    const catalog = await loadCatalog(options)
    if (!catalog.sources.some(source => source.id === sourceId)) {
      throw new Error(`找不到数据源 ${sourceId}`)
    }
  }
  await writeSelectedSourceId(options.dshHome, sessionId, sourceId)
}
