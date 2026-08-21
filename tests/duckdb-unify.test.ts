import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DuckDbEngine, isDuckDbReady, remoteConnectionString } from '../src/duckdb-engine.ts'
import { inspectSource } from '../src/source-runtime.ts'

const demoXlsx = fileURLToPath(new URL('../examples/demo.xlsx', import.meta.url))

describe('remoteConnectionString', () => {
  it('keeps postgres DSN unchanged when ssl is off', () => {
    expect(remoteConnectionString({
      type: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'analytics',
      user: 'reader',
      password: 'secret',
    })).toBe('host=127.0.0.1 port=5432 dbname=analytics user=reader password=secret')
  })

  it('adds sslmode=require for postgres when ssl is on', () => {
    expect(remoteConnectionString({
      type: 'postgres',
      host: 'db.example',
      database: 'analytics',
      user: 'reader',
      ssl: true,
    })).toContain('sslmode=require')
  })

  it('does not change mysql DSN when ssl is on (extension has no sslmode)', () => {
    const dsn = remoteConnectionString({
      type: 'mysql',
      host: '127.0.0.1',
      database: 'shop',
      user: 'root',
      ssl: true,
    })
    expect(dsn).not.toContain('sslmode')
    expect(dsn).toContain('database=shop')
  })
})

describe('DuckDB unified sources', () => {
  it('isolates two file sources that share a table name', async () => {
    if (!(await isDuckDbReady())) return
    const dir = await mkdtemp(join(tmpdir(), 'dsh-iso-'))
    const left = join(dir, 'orders.csv')
    const dirB = await mkdtemp(join(tmpdir(), 'dsh-iso-b-'))
    const rightPath = join(dirB, 'orders.csv')
    await writeFile(left, 'sku,gmv\nA,1\n', 'utf8')
    await writeFile(rightPath, 'sku,gmv\nB,9\n', 'utf8')
    const engineA = new DuckDbEngine(dir)
    const engineB = new DuckDbEngine(dirB)
    try {
      await engineA.registerFiles([{ absPath: left, relPath: 'orders.csv', kind: 'csv' }])
      await engineB.registerFiles([{ absPath: rightPath, relPath: 'orders.csv', kind: 'csv' }])
      const a = await engineA.query('SELECT sku, gmv FROM orders')
      const b = await engineB.query('SELECT sku, gmv FROM orders')
      expect(a.rows[0]?.[0]).toBe('A')
      expect(Number(a.rows[0]?.[1])).toBe(1)
      expect(b.rows[0]?.[0]).toBe('B')
      expect(Number(b.rows[0]?.[1])).toBe(9)
    } finally {
      await engineA.close()
      await engineB.close()
    }
  })

  it('queries the sqlite demo through DuckDB ATTACH', async () => {
    if (!(await isDuckDbReady())) return
    const options = {
      dshHome: await mkdtemp(join(tmpdir(), 'dsh-ds-home-')),
      workspaceRoot: await mkdtemp(join(tmpdir(), 'dsh-ds-ws-')),
    }
    const inspected = await inspectSource(options, 'demo-sqlite')
    expect(inspected.tables).toContain('orders')
    expect(inspected.preview?.rows[0]?.[1]).toBe('A')
    const engine = new DuckDbEngine(options.dshHome)
    try {
      const sqlitePath = join(options.dshHome, 'data-mode', 'demo.sqlite')
      let tables: string[]
      try {
        tables = await engine.attachDatabase({
          sourceId: 'demo-sqlite',
          type: 'sqlite',
          sqlitePath,
        })
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error)
        if (text.includes('sqlite scanner') || text.includes('sqlite_scanner')) return
        throw error
      }
      expect(tables).toContain('orders')
      const sum = await engine.query('SELECT sum(gmv) AS gmv FROM orders')
      expect(Number(sum.rows[0]?.[0])).toBeGreaterThan(0)
    } finally {
      await engine.close()
    }
  })

  it('keeps xlsx queryable after another engine closes the same workbook', async () => {
    if (!(await isDuckDbReady())) return
    const home = await mkdtemp(join(tmpdir(), 'dsh-xlsx-keep-'))
    const file = { absPath: demoXlsx, relPath: 'demo.xlsx', kind: 'xlsx' as const }
    const live = new DuckDbEngine(home)
    const preview = new DuckDbEngine(home)
    try {
      await live.registerFiles([file])
      await preview.registerFiles([file])
      await preview.close()
      const rows = await live.query('SELECT name, price FROM products WHERE name IN (\'笔记本\', \'键盘\') ORDER BY name')
      expect(rows.rowCount).toBe(2)
      const notebook = rows.rows.find(row => row[0] === '笔记本')
      const keyboard = rows.rows.find(row => row[0] === '键盘')
      expect(Number(notebook?.[1])).toBe(4999)
      expect(Number(keyboard?.[1])).toBe(199)
    } finally {
      await live.close()
      await preview.close().catch(() => undefined)
    }
  })

  it('registers the xlsx demo as in-memory DuckDB tables named after sheets', async () => {
    if (!(await isDuckDbReady())) return
    const engine = new DuckDbEngine(await mkdtemp(join(tmpdir(), 'dsh-xlsx-duck-')))
    try {
      const tables = await engine.registerFiles([{
        absPath: demoXlsx,
        relPath: 'demo.xlsx',
        kind: 'xlsx',
      }])
      expect(tables.map(table => table.name)).toContain('products')
      const rows = await engine.query('SELECT sku, name FROM products ORDER BY sku LIMIT 2')
      expect(rows.rows[0]?.[0]).toBe('A')
      expect(rows.rows[0]?.[1]).toBe('笔记本')
    } finally {
      await engine.close()
    }
  })
})
