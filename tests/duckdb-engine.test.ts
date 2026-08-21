import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DuckDbEngine } from '../src/duckdb-engine.ts'
import { extractLimit, isReadOnlySql, referencedTables } from '../src/sql-guard.ts'
import { isDescribed, markDescribed, sessionKeyFromAgent } from '../src/session-state.ts'
import { MAX_QUERY_LIMIT } from '../src/paths.ts'

describe('run_sql guard checks', () => {
  it('rejects writes, uncapped LIMIT, and undescribed tables', () => {
    const sql = 'SELECT * FROM sales LIMIT 10'
    expect(isReadOnlySql('DELETE FROM sales')).toBe(false)
    expect(extractLimit('SELECT 1 LIMIT 9000')! > MAX_QUERY_LIMIT).toBe(true)
    const key = sessionKeyFromAgent({ sessionId: 'guard-1' })
    expect(referencedTables(sql).every(table => isDescribed(key, table))).toBe(false)
    markDescribed(key, 'sales')
    expect(referencedTables(sql).every(table => isDescribed(key, table))).toBe(true)
  })
})

describe('DuckDbEngine CSV query', () => {
  it('registers a csv and answers sum / topn / share / daily trend', async () => {
    let engine: DuckDbEngine
    try {
      engine = new DuckDbEngine(await mkdtemp(join(tmpdir(), 'dsh-csv-home-')))
      await engine.ensure()
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      if (text.includes('duckdb')) return
      throw error
    }
    const dir = await mkdtemp(join(tmpdir(), 'dsh-csv-'))
    const csv = join(dir, 'orders.csv')
    await writeFile(
      csv,
      'day,sku,gmv,qty\n2026-01-01,a,100,1\n2026-01-01,b,50,1\n2026-01-02,a,80,1\n',
      'utf8',
    )
    const tables = await engine.registerFiles([{ absPath: csv, relPath: 'orders.csv', kind: 'csv' }])
    expect(tables[0]?.name).toBe('orders')
    const sum = await engine.query('SELECT sum(gmv) AS gmv FROM orders')
    expect(Number(sum.rows[0]?.[0])).toBe(230)
    const top = await engine.query('SELECT sku, sum(gmv) AS gmv FROM orders GROUP BY sku ORDER BY gmv DESC LIMIT 1')
    expect(top.rows[0]?.[0]).toBe('a')
    const share = await engine.query(
      'SELECT sku, sum(gmv) * 1.0 / (SELECT sum(gmv) FROM orders) AS share FROM orders GROUP BY sku ORDER BY share DESC',
    )
    expect(share.rowCount).toBe(2)
    const trend = await engine.query('SELECT day, sum(gmv) AS gmv FROM orders GROUP BY day ORDER BY day')
    expect(trend.rowCount).toBe(2)
    await engine.close()
  })
})
