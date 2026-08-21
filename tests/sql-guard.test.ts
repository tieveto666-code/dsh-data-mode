import { describe, expect, it } from 'vitest'
import {
  applyLimit,
  extractLimit,
  isReadOnlySql,
  referencedTables,
  skipsDescribeRequirement,
  tableNameFromFile,
} from '../src/sql-guard.ts'

describe('isReadOnlySql', () => {
  it('allows select and with', () => {
    expect(isReadOnlySql('SELECT 1')).toBe(true)
    expect(isReadOnlySql('with x as (select 1) select * from x')).toBe(true)
    expect(isReadOnlySql('EXPLAIN SELECT 1')).toBe(true)
    expect(isReadOnlySql('SHOW TABLES')).toBe(true)
    expect(isReadOnlySql('DESCRIBE sales')).toBe(true)
  })

  it('rejects writes even with comments', () => {
    expect(isReadOnlySql('DELETE FROM t')).toBe(false)
    expect(isReadOnlySql('/* comment */ DROP TABLE t')).toBe(false)
    expect(isReadOnlySql('--\nUPDATE t SET a=1')).toBe(false)
    expect(isReadOnlySql('INSERT INTO t VALUES (1)')).toBe(false)
  })
})

describe('applyLimit', () => {
  it('appends default LIMIT when missing', () => {
    expect(applyLimit('SELECT * FROM sales', 200, 5000)).toContain('LIMIT 200')
  })

  it('keeps a valid LIMIT and rejects above the hard cap', () => {
    expect(applyLimit('SELECT * FROM sales LIMIT 10', 200, 5000)).toBe('SELECT * FROM sales LIMIT 10')
    expect(() => applyLimit('SELECT * FROM sales LIMIT 9000', 200, 5000)).toThrow(/hard cap 5000/)
  })

  it('does not wrap SHOW / DESCRIBE / EXPLAIN', () => {
    expect(applyLimit('SHOW TABLES', 200, 5000)).toBe('SHOW TABLES')
    expect(skipsDescribeRequirement('EXPLAIN SELECT 1')).toBe(true)
    expect(extractLimit('SELECT 1 LIMIT 3')).toBe(3)
  })
})

describe('referencedTables', () => {
  it('collects FROM / JOIN tables and skips SHOW', () => {
    expect(referencedTables('SELECT * FROM sales JOIN dim_date ON 1=1')).toEqual(['sales', 'dim_date'])
    expect(referencedTables('SHOW TABLES')).toEqual([])
    expect(tableNameFromFile('data/2024-sales.csv')).toBe('_2024_sales')
  })
})
