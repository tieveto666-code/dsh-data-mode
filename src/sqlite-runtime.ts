import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DataSourceRecord } from './catalog/types.ts'
import type { QueryResult, TableInfo } from './data-source-types.ts'
import { applyLimit, sqlQuoteIdent } from './sql-guard.ts'
import { DEFAULT_PREVIEW_LIMIT, DEFAULT_QUERY_LIMIT, MAX_PREVIEW_LIMIT, MAX_QUERY_LIMIT } from './paths.ts'

function isAbsoluteFile(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

export function resolveSqliteFile(source: DataSourceRecord, workspaceRoot: string): string {
  const path = source.sqlitePath?.trim() ?? ''
  if (path === '') throw new Error('SQLite 文件路径为空')
  return isAbsoluteFile(path) ? path : join(workspaceRoot, path)
}

function openReadonly(path: string): DatabaseSync {
  return new DatabaseSync(path, { readOnly: true })
}

function cellValue(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
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

export async function assertSqliteFile(path: string): Promise<void> {
  try {
    await access(path)
  } catch {
    throw new Error(`找不到 SQLite 文件：${path}`)
  }
}

export function listSqliteTables(path: string): string[] {
  const db = openReadonly(path)
  try {
    const rows = db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    ).all() as Array<{ name?: unknown }>
    return rows.map(row => String(row.name ?? '')).filter(name => name !== '')
  } finally {
    db.close()
  }
}

export function describeSqliteTable(path: string, table: string): TableInfo {
  const db = openReadonly(path)
  try {
    const ident = sqlQuoteIdent(table)
    const rows = db.prepare(`PRAGMA table_info(${ident})`).all() as Array<{ name?: unknown; type?: unknown }>
    return {
      name: table,
      columns: rows.map(row => ({
        name: String(row.name ?? ''),
        type: String(row.type ?? ''),
      })),
    }
  } finally {
    db.close()
  }
}

export function previewSqlite(path: string, table: string, limit: number): QueryResult {
  const capped = Math.min(Math.max(1, Math.floor(limit || DEFAULT_PREVIEW_LIMIT)), MAX_PREVIEW_LIMIT)
  const sql = `SELECT * FROM ${sqlQuoteIdent(table)} LIMIT ${capped}`
  return querySqlite(path, sql)
}

export function querySqlite(path: string, sql: string): QueryResult {
  const limited = applyLimit(sql, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT)
  const db = openReadonly(path)
  try {
    const rows = db.prepare(limited).all() as Record<string, unknown>[]
    return rowsToResult(limited, rows)
  } finally {
    db.close()
  }
}

function bindCell(value: unknown): string | number | bigint | Buffer | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'bigint' || Buffer.isBuffer(value)) return value
  return String(value)
}

export function queryTabularSheets(
  sheets: ReadonlyArray<{ name: string; columns: string[]; rows: unknown[][] }>,
  sql: string,
): QueryResult {
  const db = new DatabaseSync(':memory:')
  try {
    for (const sheet of sheets) {
      if (sheet.columns.length === 0) continue
      const ident = sqlQuoteIdent(sheet.name)
      const cols = sheet.columns.map(column => sqlQuoteIdent(column)).join(', ')
      db.exec(`CREATE TABLE ${ident} (${cols})`)
      const placeholders = sheet.columns.map(() => '?').join(', ')
      const insert = db.prepare(`INSERT INTO ${ident} VALUES (${placeholders})`)
      for (const row of sheet.rows.slice(0, MAX_QUERY_LIMIT)) {
        insert.run(...sheet.columns.map((_, index) => bindCell(row[index])))
      }
    }
    const limited = applyLimit(sql, DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT)
    const rows = db.prepare(limited).all() as Record<string, unknown>[]
    return rowsToResult(limited, rows)
  } finally {
    db.close()
  }
}
