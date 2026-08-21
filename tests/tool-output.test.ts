import { describe, expect, it } from 'vitest'
import { asQueryResult } from '../src/data-source-types.ts'
import { sessionIdFromAgent } from '../src/session-state.ts'
import {
  NO_SOURCE_SELECTED,
  assertSourceVisible,
  visibleListPayload,
} from '../src/source-access.ts'

describe('asQueryResult', () => {
  it('drops extra fields such as table so preview_rows stays schema-valid', () => {
    const preview = {
      table: 'products',
      columns: ['sku'],
      rows: [['A']],
      rowCount: 1,
      sql: 'SELECT * FROM products LIMIT 1',
    }
    expect(asQueryResult(preview)).toEqual({
      columns: ['sku'],
      rows: [['A']],
      rowCount: 1,
      sql: 'SELECT * FROM products LIMIT 1',
    })
  })
})

function omitUndefined<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.some(containsUndefined)
  if (value !== null && typeof value === 'object') return Object.values(value).some(containsUndefined)
  return false
}

describe('list_data_sources JSON output', () => {
  it('omits undefined selectedSourceId so the payload is lossless JSON', () => {
    const payload = omitUndefined({
      sources: [
        omitUndefined({
          id: 'demo-xlsx',
          label: 'XLSX 示例',
          type: 'duckdb-files',
          readonly: true,
          available: true,
          selected: true,
          tables: ['products'],
          note: undefined,
        }),
      ],
      selectedSourceId: undefined,
    })
    expect(containsUndefined(payload)).toBe(false)
    expect(payload).toEqual({
      sources: [{
        id: 'demo-xlsx',
        label: 'XLSX 示例',
        type: 'duckdb-files',
        readonly: true,
        available: true,
        selected: true,
        tables: ['products'],
      }],
    })
  })
})

describe('selected-source visibility', () => {
  const catalog = [
    { id: 'demo-sqlite', label: 'SQLite 示例' },
    { id: 'demo-xlsx', label: 'XLSX 示例' },
  ]

  it('hides every source when none is selected', () => {
    expect(visibleListPayload(catalog, undefined)).toEqual({ sources: [] })
  })

  it('exposes only the selected source', () => {
    expect(visibleListPayload(catalog, 'demo-xlsx')).toEqual({
      sources: [{ id: 'demo-xlsx', label: 'XLSX 示例' }],
      selectedSourceId: 'demo-xlsx',
    })
  })

  it('hides a stale selection that is no longer in catalog', () => {
    expect(visibleListPayload(catalog, 'missing')).toEqual({ sources: [] })
  })

  it('refuses describe/preview/sql when the session has no selection', () => {
    expect(() => assertSourceVisible('', 'demo-xlsx')).toThrow(NO_SOURCE_SELECTED)
  })

  it('reads the live Agent session id from id / session.id', () => {
    expect(sessionIdFromAgent({ id: 'conv-1' })).toBe('conv-1')
    expect(sessionIdFromAgent({ session: { id: 'conv-2' } })).toBe('conv-2')
    expect(sessionIdFromAgent({ sessionId: 'conv-3' })).toBe('conv-3')
  })
})
