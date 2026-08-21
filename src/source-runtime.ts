import { loadCatalog } from './catalog/load-catalog.ts'
import { readSecret } from './catalog/secrets.ts'
import type { CatalogLoadOptions, DataSourceRecord } from './catalog/types.ts'
import type { QueryResult } from './data-source-types.ts'
import { DuckDbEngine, isDuckDbReady } from './duckdb-engine.ts'
import {
  DEFAULT_PREVIEW_LIMIT, MAX_PREVIEW_LIMIT, MAX_WORKSPACE_FILES,
} from './paths.ts'
import {
  assertSqliteFile, listSqliteTables, previewSqlite, resolveSqliteFile,
} from './sqlite-runtime.ts'
import { explicitFiles, findWorkspaceFiles, kindOf } from './workspace-files.ts'
import type { WorkspaceFile } from './workspace-files.ts'
import { inspectXlsxFiles } from './xlsx-runtime.ts'

export interface SourceInspect {
  sourceId: string
  label: string
  tables: string[]
  preview?: QueryResult & { table: string }
}

function isAbsoluteFile(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

export function filesFor(source: DataSourceRecord, workspaceRoot: string): Promise<WorkspaceFile[]> | WorkspaceFile[] {
  if (source.files && source.files.length > 0) {
    const files: WorkspaceFile[] = []
    const relative: string[] = []
    for (const file of source.files) {
      if (isAbsoluteFile(file)) {
        const kind = kindOf(file)
        if (kind === undefined) continue
        files.push({ absPath: file, relPath: file.replace(/\\/g, '/').split('/').pop() ?? file, kind })
        continue
      }
      relative.push(file)
    }
    return [...files, ...explicitFiles(workspaceRoot, relative)]
  }
  const globs = source.workspaceGlobs ?? ['**/*.csv', '**/*.xlsx', '**/*.parquet']
  return findWorkspaceFiles(workspaceRoot, globs, MAX_WORKSPACE_FILES)
}

export async function xlsxOnlyFiles(
  source: DataSourceRecord,
  workspaceRoot: string,
): Promise<WorkspaceFile[] | undefined> {
  if (source.type !== 'duckdb-files') return undefined
  const files = await filesFor(source, workspaceRoot)
  const xlsx = files.filter(file => file.kind === 'xlsx')
  const other = files.filter(file => file.kind !== 'xlsx')
  if (xlsx.length > 0 && other.length === 0) return xlsx
  return undefined
}

export async function ensureSourceOnEngine(
  engine: DuckDbEngine,
  source: DataSourceRecord,
  options: CatalogLoadOptions,
): Promise<string[]> {
  if (source.type === 'duckdb-files') {
    const files = await filesFor(source, options.workspaceRoot)
    const tables = await engine.registerFiles(files)
    return tables.map(table => table.name)
  }
  if (source.type === 'sqlite') {
    const sqlitePath = resolveSqliteFile(source, options.workspaceRoot)
    await assertSqliteFile(sqlitePath)
    return engine.attachDatabase({
      sourceId: source.id,
      type: 'sqlite',
      sqlitePath,
    })
  }
  if (source.type === 'postgres' || source.type === 'mysql') {
    const password = await readSecret(options.dshHome, source.id)
    return engine.attachDatabase({
      sourceId: source.id,
      type: source.type,
      sqlitePath: undefined,
      host: source.host,
      port: source.port,
      database: source.database,
      user: source.user,
      password,
      ssl: source.ssl,
    })
  }
  throw new Error(`Data source "${source.id}" type is not supported`)
}

export async function canNativeFallback(
  source: DataSourceRecord,
  workspaceRoot: string,
): Promise<boolean> {
  if (source.type === 'sqlite') return true
  return (await xlsxOnlyFiles(source, workspaceRoot)) !== undefined
}

async function inspectViaEngine(
  engine: DuckDbEngine,
  source: DataSourceRecord,
  options: CatalogLoadOptions,
  table: string | undefined,
  limit: number | undefined,
): Promise<SourceInspect> {
  const tables = await ensureSourceOnEngine(engine, source, options)
  const chosen = table === undefined || table === ''
    ? tables[0]
    : tables.find(name => name.toLowerCase() === table.toLowerCase())
  if (chosen === undefined) {
    if (table !== undefined && table !== '') throw new Error(`表 "${table}" 不在数据源 "${source.id}" 中`)
    return { sourceId: source.id, label: source.label, tables }
  }
  await engine.describeTable(chosen)
  const capped = Math.min(Math.max(1, Math.floor(limit || DEFAULT_PREVIEW_LIMIT)), MAX_PREVIEW_LIMIT)
  const preview = await engine.preview(chosen, capped)
  return { sourceId: source.id, label: source.label, tables, preview: { ...preview, table: chosen } }
}

function inspectSqliteNative(
  source: DataSourceRecord,
  workspaceRoot: string,
  table: string | undefined,
  limit: number | undefined,
): SourceInspect {
  const sqlitePath = resolveSqliteFile(source, workspaceRoot)
  const tables = listSqliteTables(sqlitePath)
  const chosen = table === undefined || table === ''
    ? tables[0]
    : tables.find(name => name.toLowerCase() === table.toLowerCase())
  if (chosen === undefined) {
    if (table !== undefined && table !== '') throw new Error(`表 "${table}" 不在数据源 "${source.id}" 中`)
    return { sourceId: source.id, label: source.label, tables }
  }
  const capped = Math.min(Math.max(1, Math.floor(limit || DEFAULT_PREVIEW_LIMIT)), MAX_PREVIEW_LIMIT)
  const preview = previewSqlite(sqlitePath, chosen, capped)
  return { sourceId: source.id, label: source.label, tables, preview: { ...preview, table: chosen } }
}

async function inspectNativeFallback(
  source: DataSourceRecord,
  options: CatalogLoadOptions,
  table: string | undefined,
  limit: number | undefined,
): Promise<SourceInspect> {
  if (source.type === 'sqlite') {
    const sqlitePath = resolveSqliteFile(source, options.workspaceRoot)
    await assertSqliteFile(sqlitePath)
    return inspectSqliteNative(source, options.workspaceRoot, table, limit)
  }
  const xlsx = await xlsxOnlyFiles(source, options.workspaceRoot)
  if (xlsx !== undefined) {
    const inspected = await inspectXlsxFiles(xlsx, table, limit)
    if (table !== undefined && table !== '' && inspected.preview === undefined && inspected.tables.length > 0) {
      throw new Error(`表 "${table}" 不在数据源 "${source.id}" 中`)
    }
    return { sourceId: source.id, label: source.label, ...inspected }
  }
  throw new Error(`Data source "${source.id}" type is not supported without DuckDB`)
}

export async function inspectSource(
  options: CatalogLoadOptions,
  sourceId: string,
  table?: string,
  limit?: number,
): Promise<SourceInspect> {
  const catalog = await loadCatalog(options)
  const source = catalog.sources.find(item => item.id === sourceId)
  if (source === undefined) throw new Error(`找不到数据源 ${sourceId}`)

  if (await isDuckDbReady()) {
    const engine = new DuckDbEngine(options.dshHome)
    try {
      return await inspectViaEngine(engine, source, options, table, limit)
    } catch (error) {
      if (!(await canNativeFallback(source, options.workspaceRoot))) throw error
    } finally {
      await engine.close()
    }
  }

  if (await canNativeFallback(source, options.workspaceRoot)) {
    return inspectNativeFallback(source, options, table, limit)
  }

  const engine = new DuckDbEngine(options.dshHome)
  try {
    return await inspectViaEngine(engine, source, options, table, limit)
  } finally {
    await engine.close()
  }
}
