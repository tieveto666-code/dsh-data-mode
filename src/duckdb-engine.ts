import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { applyLimit, sqlQuoteIdent, sqlQuoteLiteral, tableNameFromFile } from './sql-guard.ts'
import { DEFAULT_QUERY_LIMIT, MAX_PREVIEW_LIMIT, MAX_QUERY_LIMIT, DATA_MODE_DIR, resolveDshHome } from './paths.ts'
import type { QueryResult, TableInfo } from './data-source-types.ts'
import type { WorkspaceFile } from './workspace-files.ts'
import { withTimeout } from './with-timeout.ts'
import { materializeXlsxCsvs } from './xlsx-runtime.ts'

interface DuckDbConnection {
  all(sql: string, callback: (err: Error | null, rows: Record<string, unknown>[]) => void): void
  exec(sql: string, callback: (err: Error | null) => void): void
}

interface DuckDbDatabase {
  connect(): DuckDbConnection
  close(callback: (err: Error | null) => void): void
}

interface DuckDbModule {
  Database: new (path: string) => DuckDbDatabase
}

export interface RegisteredTable {
  name: string
  file: WorkspaceFile
}

const require = createRequire(import.meta.url)

function cellValue(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return 0
  return value
}

function rowsToResult(sql: string, rows: Record<string, unknown>[]): QueryResult {
  const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
  const limited = rows.slice(0, MAX_QUERY_LIMIT)
  return {
    columns,
    rows: limited.map(row => columns.map(column => cellValue(row[column]))),
    rowCount: limited.length,
    sql,
  }
}

function execSql(conn: DuckDbConnection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function allSql(conn: DuckDbConnection, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) reject(err)
      else resolve(rows ?? [])
    })
  })
}

export function duckDbPackageInstalled(): boolean {
  try {
    require.resolve('duckdb')
    return true
  } catch {
    return false
  }
}

const DUCKDB_LOAD_ERROR = 'dsh-data-mode: optional dependency "duckdb" is not installed or failed to load'

let loadPromise: Promise<DuckDbModule> | undefined
let loadFailed = false

async function importDuckDb(): Promise<DuckDbModule> {
  const loaded = await withTimeout(
    import('duckdb') as Promise<{ default?: DuckDbModule } & Partial<DuckDbModule>>,
    8000,
    '加载 duckdb 超时。请确认已编译 native 绑定。',
  )
  const Database = loaded.Database ?? loaded.default?.Database
  if (Database === undefined) throw new Error('duckdb export missing Database')
  return { Database }
}

export async function loadDuckDb(): Promise<DuckDbModule> {
  if (loadFailed) throw new Error(`${DUCKDB_LOAD_ERROR}. Install duckdb to query data sources.`)
  if (!duckDbPackageInstalled()) {
    loadFailed = true
    throw new Error(`${DUCKDB_LOAD_ERROR}. Install duckdb to query data sources.`)
  }
  if (loadPromise === undefined) {
    loadPromise = importDuckDb().catch((error: unknown) => {
      loadFailed = true
      loadPromise = undefined
      const text = error instanceof Error ? error.message : String(error)
      throw new Error(`${DUCKDB_LOAD_ERROR} (${text}).`)
    })
  }
  return loadPromise
}

/** Fast probe used to keep sqlite / xlsx native fallbacks when DuckDB is missing. */
export async function isDuckDbReady(): Promise<boolean> {
  if (loadFailed) return false
  if (!duckDbPackageInstalled()) return false
  try {
    await loadDuckDb()
    return true
  } catch {
    return false
  }
}

function uniqueTableName(file: WorkspaceFile, used: Set<string>): string {
  const base = tableNameFromFile(file.relPath)
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase())
    return base
  }
  let index = 2
  while (used.has(`${base}_${index}`.toLowerCase())) index += 1
  const name = `${base}_${index}`
  used.add(name.toLowerCase())
  return name
}

function viewSql(table: RegisteredTable): string {
  const ident = sqlQuoteIdent(table.name)
  const path = sqlQuoteLiteral(table.file.absPath)
  if (table.file.kind === 'parquet') {
    return `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM read_parquet(${path})`
  }
  return `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM read_csv_auto(${path}, HEADER=true, AUTO_DETECT=true)`
}

function copyCsvTableSql(name: string, absPath: string): string {
  return `CREATE OR REPLACE TABLE ${sqlQuoteIdent(name)} AS SELECT * FROM read_csv_auto(${sqlQuoteLiteral(absPath)}, HEADER=true, AUTO_DETECT=true)`
}

function attachAlias(sourceId: string): string {
  const cleaned = sourceId.replace(/[^a-zA-Z0-9_]+/g, '_')
  return cleaned.replace(/^(\d)/, '_$1') || 'src'
}

export function remoteConnectionString(input: {
  type: 'postgres' | 'mysql'
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  ssl?: boolean
}): string {
  const host = input.host ?? '127.0.0.1'
  const port = input.port ?? (input.type === 'mysql' ? 3306 : 5432)
  const database = input.database ?? ''
  const user = input.user ?? ''
  const password = input.password ?? ''
  const parts = [
    `host=${host}`,
    `port=${port}`,
    database === '' ? '' : input.type === 'mysql' ? `database=${database}` : `dbname=${database}`,
    user === '' ? '' : `user=${user}`,
    password === '' ? '' : `password=${password}`,
    input.ssl === true && input.type === 'postgres' ? 'sslmode=require' : '',
  ].filter(part => part !== '')
  return parts.join(' ')
}

async function loadSqliteScanner(conn: DuckDbConnection): Promise<boolean> {
  for (const name of ['sqlite', 'sqlite_scanner']) {
    try {
      await execSql(conn, `LOAD ${name};`)
      return true
    } catch {
      continue
    }
  }
  return false
}

export class DuckDbEngine {
  private db: DuckDbDatabase | undefined
  private conn: DuckDbConnection | undefined
  private readonly registered = new Map<string, RegisteredTable>()
  private readonly attached = new Set<string>()
  private readonly tempDirs = new Set<string>()

  constructor(private readonly dshHome?: string) {}

  async ensure(): Promise<DuckDbConnection> {
    if (this.conn !== undefined) return this.conn
    const duckdb = await loadDuckDb()
    this.db = new duckdb.Database(':memory:')
    this.conn = this.db.connect()
    const home = join(this.dshHome ?? resolveDshHome(), DATA_MODE_DIR, 'duckdb')
    await mkdir(join(home, 'extensions'), { recursive: true })
    await execSql(this.conn, `SET home_directory=${sqlQuoteLiteral(home)}`)
    await execSql(this.conn, `SET extension_directory=${sqlQuoteLiteral(join(home, 'extensions'))}`)
    await execSql(this.conn, 'SET autoinstall_known_extensions=false')
    await execSql(this.conn, 'SET autoload_known_extensions=false')
    return this.conn
  }

  async registerFiles(files: readonly WorkspaceFile[]): Promise<RegisteredTable[]> {
    const conn = await this.ensure()
    const used = new Set([...this.registered.keys()].map(name => name.toLowerCase()))
    const created: RegisteredTable[] = []
    const flattened: WorkspaceFile[] = []
    for (const file of files) {
      if (file.kind === 'xlsx') {
        const csvs = await materializeXlsxCsvs(file)
        const dir = csvs[0] === undefined ? undefined : dirname(csvs[0].absPath)
        if (dir !== undefined) this.tempDirs.add(dir)
        try {
          for (const csv of csvs) {
            const table: RegisteredTable = { name: uniqueTableName(csv, used), file: csv }
            await execSql(conn, copyCsvTableSql(table.name, csv.absPath))
            this.registered.set(table.name, table)
            created.push(table)
          }
        } finally {
          if (dir !== undefined) {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined)
            this.tempDirs.delete(dir)
          }
        }
        continue
      }
      flattened.push(file)
    }
    for (const file of flattened) {
      const existing = [...this.registered.values()].find(table => table.file.absPath === file.absPath)
      if (existing !== undefined) {
        created.push(existing)
        continue
      }
      const table: RegisteredTable = { name: uniqueTableName(file, used), file }
      await execSql(conn, viewSql(table))
      this.registered.set(table.name, table)
      created.push(table)
    }
    return created
  }

  async attachDatabase(input: {
    sourceId: string
    type: 'postgres' | 'mysql' | 'sqlite'
    sqlitePath?: string
    host?: string
    port?: number
    database?: string
    user?: string
    password?: string
    ssl?: boolean
  }): Promise<string[]> {
    const conn = await this.ensure()
    const alias = attachAlias(input.sourceId)
    if (!this.attached.has(alias)) {
      if (input.type === 'sqlite') {
        const path = input.sqlitePath?.trim() ?? ''
        if (path === '') throw new Error('SQLite 文件路径为空')
        if (!(await loadSqliteScanner(conn))) {
          throw new Error('DuckDB sqlite scanner is not available')
        }
        await withTimeout(
          execSql(conn, `ATTACH ${sqlQuoteLiteral(path)} AS ${sqlQuoteIdent(alias)} (TYPE SQLITE, READ_ONLY)`),
          8000,
          'ATTACH SQLITE 超时',
        )
      } else {
        const ext = input.type
        try {
          await withTimeout(execSql(conn, `LOAD ${ext};`), 3000, `LOAD ${ext} 超时`)
        } catch {
          await withTimeout(execSql(conn, `INSTALL ${ext}; LOAD ${ext};`), 8000, `INSTALL ${ext} 超时`)
        }
        const dsn = remoteConnectionString({
          type: input.type,
          host: input.host,
          port: input.port,
          database: input.database,
          user: input.user,
          password: input.password,
          ssl: input.ssl,
        })
        await execSql(
          conn,
          `ATTACH ${sqlQuoteLiteral(dsn)} AS ${sqlQuoteIdent(alias)} (TYPE ${input.type.toUpperCase()}, READ_ONLY)`,
        )
      }
      this.attached.add(alias)
    }
    const rows = await allSql(conn, `SHOW ALL TABLES`)
    const tables: string[] = []
    const seen = new Set<string>()
    for (const row of rows) {
      const database = String(row.database ?? row.Database ?? '')
      const name = String(row.name ?? row.table_name ?? row.Table ?? '')
      if (name === '' || database !== alias) continue
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      const ident = sqlQuoteIdent(name)
      const qualified = `${sqlQuoteIdent(alias)}.${ident}`
      try {
        await execSql(conn, `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM ${qualified}`)
      } catch {
        const schema = String(row.schema ?? row.Schema ?? 'main')
        await execSql(
          conn,
          `CREATE OR REPLACE VIEW ${ident} AS SELECT * FROM ${sqlQuoteIdent(alias)}.${sqlQuoteIdent(schema)}.${ident}`,
        )
      }
      tables.push(name)
    }
    return tables
  }

  table(name: string): RegisteredTable | undefined {
    if (this.registered.has(name)) return this.registered.get(name)
    const lower = name.toLowerCase()
    for (const [key, table] of this.registered) {
      if (key.toLowerCase() === lower) return table
    }
    return undefined
  }

  async describeTable(name: string): Promise<TableInfo> {
    const conn = await this.ensure()
    const table = this.table(name)
    const ident = sqlQuoteIdent(table?.name ?? name)
    const rows = await allSql(conn, `DESCRIBE ${ident}`)
    return {
      name: table?.name ?? name,
      file: table?.file.relPath,
      columns: rows.map(row => ({
        name: String(row.column_name ?? row.Column ?? row.name ?? ''),
        type: String(row.column_type ?? row.Type ?? row.type ?? ''),
      })),
    }
  }

  async query(sql: string, signal?: AbortSignal): Promise<QueryResult> {
    signal?.throwIfAborted()
    const conn = await this.ensure()
    const limited = applyLimit(sql, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT)
    const rows = await allSql(conn, limited)
    signal?.throwIfAborted()
    return rowsToResult(limited, rows)
  }

  async preview(tableName: string, limit: number): Promise<QueryResult> {
    const table = this.table(tableName)
    const ident = sqlQuoteIdent(table?.name ?? tableName)
    const capped = Math.min(Math.max(1, Math.floor(limit)), MAX_PREVIEW_LIMIT)
    return this.query(`SELECT * FROM ${ident} LIMIT ${capped}`)
  }

  async close(): Promise<void> {
    const db = this.db
    this.db = undefined
    this.conn = undefined
    this.registered.clear()
    this.attached.clear()
    const dirs = [...this.tempDirs]
    this.tempDirs.clear()
    for (const dir of dirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
    if (db === undefined) return
    await new Promise<void>((resolve, reject) => {
      db.close(err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
