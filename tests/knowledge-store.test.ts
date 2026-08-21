import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addKnowledgeEntry, deleteKnowledge, loadKnowledge, loadKnowledgeSync, removeKnowledgeEntries, removeKnowledgeEntry, updateKnowledgeEntry,
} from '../src/knowledge-store.ts'

describe('knowledge store', () => {
  it('allows the same key to keep multiple values and updates by id', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-know-'))
    const first = await addKnowledgeEntry(dshHome, 'demo-xlsx', {
      key: '主营业务收入',
      value: '主营业务收入=联网通信主营业务收入+算网数智主营业务收入',
    })
    const second = await addKnowledgeEntry(dshHome, 'demo-xlsx', {
      key: '主营业务收入',
      value: '主营业务收入指的是中国联通全量的收入合集',
    })
    expect(second.entries).toHaveLength(2)
    expect(second.entries.map(entry => entry.key)).toEqual(['主营业务收入', '主营业务收入'])
    const updated = await updateKnowledgeEntry(dshHome, 'demo-xlsx', {
      id: first.entries[0]!.id,
      key: '主营业务收入',
      value: '口径已修订',
    })
    expect(updated.entries.find(entry => entry.id === first.entries[0]!.id)?.value).toBe('口径已修订')
    const removed = await removeKnowledgeEntry(dshHome, 'demo-xlsx', second.entries[1]!.id)
    expect(removed.entries).toHaveLength(1)
    expect(loadKnowledgeSync(dshHome, 'demo-xlsx')).toHaveLength(1)
  })

  it('rejects names longer than 100 characters and can delete many ids at once', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-know-'))
    await expect(addKnowledgeEntry(dshHome, 'demo-xlsx', {
      key: '名'.repeat(101),
      value: '描述',
    })).rejects.toThrow(/不能超过/)
    await expect(addKnowledgeEntry(dshHome, 'demo-xlsx', {
      key: '名称',
      value: '描'.repeat(1001),
    })).rejects.toThrow(/不能超过/)
    const first = await addKnowledgeEntry(dshHome, 'demo-xlsx', { key: 'A', value: '1' })
    const second = await addKnowledgeEntry(dshHome, 'demo-xlsx', { key: 'B', value: '2' })
    const removed = await removeKnowledgeEntries(dshHome, 'demo-xlsx', [
      first.entries[0]!.id,
      second.entries[1]!.id,
    ])
    expect(removed.entries).toEqual([])
  })

  it('rejects empty fields and deletes the file with the source', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-know-'))
    await expect(addKnowledgeEntry(dshHome, 'demo-sqlite', { key: '  ', value: 'x' })).rejects.toThrow(/键不能为空/)
    await addKnowledgeEntry(dshHome, 'demo-sqlite', { key: 'GMV', value: '销售额合计' })
    await deleteKnowledge(dshHome, 'demo-sqlite')
    expect((await loadKnowledge(dshHome, 'demo-sqlite')).entries).toEqual([])
    await expect(readFile(join(dshHome, 'data-mode', 'knowledge', 'demo-sqlite.json'), 'utf8')).rejects.toThrow()
  })
})
