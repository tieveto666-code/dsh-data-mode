import { Service, type Context } from '@deepseek-ai/cordis'
import { loadCatalog } from './catalog/load-catalog.ts'
import type { DataSourceRecord } from './catalog/types.ts'
import {
  asQueryResult,
  type DataSourceService,
  type DataSourceSummary,
  type DescribeResult,
  type QueryResult,
} from './data-source-types.ts'
import { DuckDbEngine, isDuckDbReady } from './duckdb-engine.ts'
import { DEFAULT_PREVIEW_LIMIT, MAX_PREVIEW_LIMIT, resolveDshHome, resolveWorkspaceRoot } from './paths.ts'
import { canNativeFallback, ensureSourceOnEngine, xlsxOnlyFiles } from './source-runtime.ts'
import {
  assertSqliteFile, describeSqliteTable, listSqliteTables, previewSqlite, querySqlite, resolveSqliteFile,
} from './sqlite-runtime.ts'
import { describeXlsxTable, inspectXlsxFiles, loadXlsxTables, queryXlsxFiles } from './xlsx-runtime.ts'

export const name = 'dsh-data-provider-duckdb'

type SourceBackend = 'duckdb' | 'native'

export default class DuckDbDataSource extends Service implements DataSourceService {
  private readonly engines = new Map<string, DuckDbEngine>()
  private readonly tablesBySource = new Map<string, string[]>()
  private readonly backendBySource = new Map<string, SourceBackend>()

  constructor(ctx: Context) {
    super(ctx, 'dataSource')
  }

  private catalogOptions() {
    return { dshHome: resolveDshHome(), workspaceRoot: resolveWorkspaceRoot() }
  }

  private engineFor(sourceId: string): DuckDbEngine {
    const existing = this.engines.get(sourceId)
    if (existing !== undefined) return existing
    const engine = new DuckDbEngine(this.catalogOptions().dshHome)
    this.engines.set(sourceId, engine)
    return engine
  }

  private async discardEngine(sourceId: string): Promise<void> {
    const engine = this.engines.get(sourceId)
    this.engines.delete(sourceId)
    if (engine === undefined) return
    await engine.close().catch(() => undefined)
  }

  private async source(sourceId: string): Promise<DataSourceRecord> {
    const catalog = await loadCatalog(this.catalogOptions())
    const found = catalog.sources.find(item => item.id === sourceId)
    if (found === undefined) {
      throw new Error(`Unknown data source "${sourceId}". Call list_data_sources first.`)
    }
    return found
  }

  private async ensureNative(source: DataSourceRecord): Promise<string[]> {
    if (source.type === 'sqlite') {
      const sqlitePath = resolveSqliteFile(source, this.catalogOptions().workspaceRoot)
      await assertSqliteFile(sqlitePath)
      return listSqliteTables(sqlitePath)
    }
    const xlsx = await xlsxOnlyFiles(source, this.catalogOptions().workspaceRoot)
    if (xlsx !== undefined) {
      const loaded = await loadXlsxTables(xlsx)
      return loaded.tables
    }
    throw new Error(`Data source "${source.id}" requires DuckDB`)
  }

  private async ensureSource(source: DataSourceRecord): Promise<string[]> {
    const cached = this.tablesBySource.get(source.id)
    if (cached !== undefined && this.backendBySource.has(source.id)) return cached

    if (await isDuckDbReady()) {
      try {
        const names = await ensureSourceOnEngine(this.engineFor(source.id), source, this.catalogOptions())
        this.tablesBySource.set(source.id, names)
        this.backendBySource.set(source.id, 'duckdb')
        return names
      } catch (error) {
        await this.discardEngine(source.id)
        if (!(await canNativeFallback(source, this.catalogOptions().workspaceRoot))) throw error
      }
    }

    const names = await this.ensureNative(source)
    this.tablesBySource.set(source.id, names)
    this.backendBySource.set(source.id, 'native')
    return names
  }

  private backend(sourceId: string): SourceBackend {
    return this.backendBySource.get(sourceId) ?? 'duckdb'
  }

  async listSources(filter?: { sourceId?: string }): Promise<DataSourceSummary[]> {
    const catalog = await loadCatalog(this.catalogOptions())
    const wanted = filter?.sourceId
    const catalogSources = wanted
      ? catalog.sources.filter(source => source.id === wanted)
      : catalog.sources
    const summaries: DataSourceSummary[] = []
    for (const source of catalogSources) {
      try {
        const tables = await this.ensureSource(source)
        summaries.push({
          id: source.id,
          label: source.label,
          type: source.type,
          readonly: true,
          available: true,
          tables,
          selected: wanted === undefined ? false : source.id === wanted,
        })
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        summaries.push({
          id: source.id,
          label: source.label,
          type: source.type,
          readonly: true,
          available: false,
          selected: wanted === undefined ? false : source.id === wanted,
          note: text,
        })
      }
    }
    return summaries
  }

  async describe(input: { sourceId: string; table?: string }): Promise<DescribeResult> {
    const source = await this.source(input.sourceId)
    const names = await this.ensureSource(source)
    const selected = input.table
      ? names.filter(name => name.toLowerCase() === input.table!.toLowerCase())
      : names
    if (input.table && selected.length === 0) {
      throw new Error(`Table "${input.table}" is not in source "${source.id}"`)
    }
    if (this.backend(source.id) === 'native') {
      if (source.type === 'sqlite') {
        const sqlitePath = resolveSqliteFile(source, this.catalogOptions().workspaceRoot)
        await assertSqliteFile(sqlitePath)
        return {
          sourceId: source.id,
          tables: selected.map(name => describeSqliteTable(sqlitePath, name)),
        }
      }
      const xlsx = await xlsxOnlyFiles(source, this.catalogOptions().workspaceRoot)
      if (xlsx !== undefined) {
        const loaded = await loadXlsxTables(xlsx)
        return {
          sourceId: source.id,
          tables: selected.map((name) => {
            const sheet = loaded.byName.get(name)
              ?? [...loaded.byName.values()].find(item => item.name.toLowerCase() === name.toLowerCase())
            if (sheet === undefined) throw new Error(`Table "${name}" is not in source "${source.id}"`)
            return describeXlsxTable(sheet)
          }),
        }
      }
    }
    const engine = this.engineFor(source.id)
    return {
      sourceId: source.id,
      tables: await Promise.all(selected.map(name => engine.describeTable(name))),
    }
  }

  async preview(input: { sourceId: string; table: string; limit: number }): Promise<QueryResult> {
    const source = await this.source(input.sourceId)
    await this.describe({ sourceId: input.sourceId, table: input.table })
    const limit = Math.min(Math.max(1, Math.floor(input.limit || DEFAULT_PREVIEW_LIMIT)), MAX_PREVIEW_LIMIT)
    if (this.backend(source.id) === 'native') {
      if (source.type === 'sqlite') {
        const sqlitePath = resolveSqliteFile(source, this.catalogOptions().workspaceRoot)
        return previewSqlite(sqlitePath, input.table, limit)
      }
      const xlsx = await xlsxOnlyFiles(source, this.catalogOptions().workspaceRoot)
      if (xlsx !== undefined) {
        const inspected = await inspectXlsxFiles(xlsx, input.table, limit)
        if (inspected.preview === undefined) throw new Error(`Table "${input.table}" is not in source "${source.id}"`)
        return asQueryResult(inspected.preview)
      }
    }
    return asQueryResult(await this.engineFor(source.id).preview(input.table, limit))
  }

  async query(input: { sourceId: string; sql: string; signal?: AbortSignal }): Promise<QueryResult> {
    const source = await this.source(input.sourceId)
    await this.ensureSource(source)
    if (this.backend(source.id) === 'native') {
      if (source.type === 'sqlite') {
        input.signal?.throwIfAborted()
        const sqlitePath = resolveSqliteFile(source, this.catalogOptions().workspaceRoot)
        await assertSqliteFile(sqlitePath)
        return querySqlite(sqlitePath, input.sql)
      }
      const xlsx = await xlsxOnlyFiles(source, this.catalogOptions().workspaceRoot)
      if (xlsx !== undefined) {
        input.signal?.throwIfAborted()
        return queryXlsxFiles(xlsx, input.sql)
      }
    }
    return asQueryResult(await this.engineFor(source.id).query(input.sql, input.signal))
  }
}
