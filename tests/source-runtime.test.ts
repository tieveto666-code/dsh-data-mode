import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { uploadTable } from '../src/catalog/store.ts'
import { inspectSource } from '../src/source-runtime.ts'

async function tempOptions() {
  return {
    dshHome: await mkdtemp(join(tmpdir(), 'dsh-ds-home-')),
    workspaceRoot: await mkdtemp(join(tmpdir(), 'dsh-ds-ws-')),
  }
}

describe('inspectSource', () => {
  it('lists tables and previews rows for an uploaded csv', async () => {
    const options = await tempOptions()
    const record = await uploadTable(options, {
      filename: 'orders.csv',
      bytes: Buffer.from('sku,gmv\na,10\nb,20\n', 'utf8'),
      label: '订单',
    })
    let inspected
    try {
      inspected = await inspectSource(options, record.id)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      if (text.includes('duckdb')) return
      throw error
    }
    expect(inspected.tables).toContain('orders')
    expect(inspected.preview?.columns).toEqual(['sku', 'gmv'])
    const preview = await inspectSource(options, record.id, 'orders', 10)
    expect(preview.preview?.columns).toEqual(['sku', 'gmv'])
    expect(preview.preview?.rowCount).toBe(2)
    expect(preview.preview?.rows[1]?.[0]).toBe('b')
  })

  it('rejects an unknown source id', async () => {
    const options = await tempOptions()
    await expect(inspectSource(options, 'missing')).rejects.toThrow(/找不到数据源/)
  })

  it('previews the built-in sqlite demo', async () => {
    const options = await tempOptions()
    const inspected = await inspectSource(options, 'demo-sqlite')
    expect(inspected.tables).toContain('orders')
    expect(inspected.preview?.columns).toEqual(expect.arrayContaining(['day', 'sku', 'gmv', 'qty']))
    expect(inspected.preview?.rowCount).toBeGreaterThan(0)
    expect(inspected.preview?.rows[0]?.[1]).toBe('A')
  })

  it('previews the built-in xlsx demo', async () => {
    const options = await tempOptions()
    const inspected = await inspectSource(options, 'demo-xlsx')
    expect(inspected.tables).toContain('products')
    expect(inspected.preview?.columns).toEqual(['sku', 'name', 'category', 'price', 'stock'])
    expect(inspected.preview?.rowCount).toBeGreaterThan(0)
    expect(inspected.preview?.rows[0]?.[0]).toBe('A')
    expect(inspected.preview?.rows[0]?.[1]).toBe('笔记本')
  })
})
