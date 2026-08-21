import { describe, expect, it } from 'vitest'
import { knowledgeWorkbook, zipStore } from '../src/xlsx-workbook.ts'

describe('knowledge xlsx export', () => {
  it('writes a stored zip that Excel can open as .xlsx', () => {
    const bytes = knowledgeWorkbook([
      { key: '主营业务收入', value: '联网通信+算网数智' },
    ])
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('PK\x03\x04')
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('xl/worksheets/sheet1.xml')
    expect(text).toContain('主营业务收入')
    expect(text).toContain('联网通信+算网数智')
    expect(text).toContain('知识名称')
  })

  it('escapes xml in cell text', () => {
    const bytes = zipStore([{ name: 'a.xml', data: new TextEncoder().encode('<ok/>') }])
    expect(bytes[0]).toBe(0x50)
    const book = knowledgeWorkbook([{ key: 'A&B<C>', value: 'x"y' }])
    const text = new TextDecoder().decode(book)
    expect(text).toContain('A&amp;B&lt;C&gt;')
    expect(text).toContain('x&quot;y')
  })
})
