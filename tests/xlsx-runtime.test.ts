import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { inspectXlsxFiles, queryXlsxFiles, readXlsxSheets } from '../src/xlsx-runtime.ts'

const demoXlsx = fileURLToPath(new URL('../examples/demo.xlsx', import.meta.url))

describe('xlsx runtime', () => {
  it('reads the packaged products sheet', async () => {
    const sheets = await readXlsxSheets(demoXlsx)
    expect(sheets.map(sheet => sheet.name)).toEqual(['products'])
    expect(sheets[0]?.columns).toEqual(['sku', 'name', 'category', 'price', 'stock'])
    expect(sheets[0]?.rows[0]).toEqual(['A', '笔记本', '数码', 4999, 12])
  })

  it('previews rows without duckdb', async () => {
    const inspected = await inspectXlsxFiles([{
      absPath: demoXlsx,
      relPath: 'demo.xlsx',
      kind: 'xlsx',
    }], undefined, 3)
    expect(inspected.tables).toEqual(['products'])
    expect(inspected.preview?.rowCount).toBe(3)
    expect(inspected.preview?.rows[1]?.[1]).toBe('鼠标')
    expect(inspected.preview && 'table' in inspected.preview).toBe(true)
    const { table: _table, ...query } = inspected.preview!
    expect(Object.keys(query).sort()).toEqual(['columns', 'rowCount', 'rows', 'sql'])
  })

  it('answers SQL against the demo sheet without duckdb', async () => {
    const files = [{ absPath: demoXlsx, relPath: 'demo.xlsx', kind: 'xlsx' as const }]
    const result = await queryXlsxFiles(files, 'SELECT sku, name FROM products WHERE category = \'数码\' ORDER BY sku')
    expect(result.columns).toEqual(['sku', 'name'])
    expect(result.rowCount).toBe(3)
    expect(result.rows[0]).toEqual(['A', '笔记本'])
  })
})
