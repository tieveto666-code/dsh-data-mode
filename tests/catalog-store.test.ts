import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { connectDatabase, listSourceViews, removeSource, selectSource, uploadTable } from '../src/catalog/store.ts'
import { loadCatalog } from '../src/catalog/load-catalog.ts'
import { addKnowledgeEntry, loadKnowledge } from '../src/knowledge-store.ts'

async function tempOptions() {
  return {
    dshHome: await mkdtemp(join(tmpdir(), 'dsh-ds-home-')),
    workspaceRoot: await mkdtemp(join(tmpdir(), 'dsh-ds-ws-')),
  }
}

describe('catalog store', () => {
  it('uploads csv, selects it, and lists it under upload origin', async () => {
    const options = await tempOptions()
    const record = await uploadTable(options, {
      filename: '销售.csv',
      bytes: Buffer.from('sku,gmv\na,1\n', 'utf8'),
      label: '销售表',
    })
    expect(record.origin).toBe('upload')
    expect(record.files?.[0]).toMatch(/\.dsh\/data-mode\/uploads\//)
    const saved = await readFile(join(options.workspaceRoot, record.files![0]!), 'utf8')
    expect(saved).toContain('sku,gmv')
    await selectSource(options, 'session-1', record.id)
    const listed = await listSourceViews(options, 'session-1')
    expect(listed.selectedSourceId).toBe(record.id)
    expect(listed.sources.some(source => source.id === record.id && source.selected)).toBe(true)
    expect(listed.sources.some(source => source.id === 'workspace-files')).toBe(false)
  })

  it('connects postgres without writing the password into catalog.yaml', async () => {
    const options = await tempOptions()
    const record = await connectDatabase(options, {
      engine: 'postgres',
      label: '仓',
      host: '127.0.0.1',
      port: 5432,
      database: 'analytics',
      user: 'reader',
      password: 's3cret',
    })
    expect(record.type).toBe('postgres')
    expect(record.origin).toBe('database')
    const yaml = await readFile(join(options.workspaceRoot, '.dsh', 'data-mode', 'catalog.yaml'), 'utf8')
    expect(yaml).toContain('analytics')
    expect(yaml).not.toContain('s3cret')
    const catalog = await loadCatalog(options)
    expect(catalog.sources.some(source => source.id === record.id)).toBe(true)
    expect(catalog.sources.some(source => source.id === 'demo-sqlite')).toBe(true)
    expect(catalog.sources.some(source => source.id === 'demo-xlsx')).toBe(true)
  })

  it('rejects non csv/xlsx uploads and can remove a source', async () => {
    const options = await tempOptions()
    await expect(uploadTable(options, {
      filename: 'notes.txt',
      bytes: Buffer.from('nope', 'utf8'),
    })).rejects.toThrow(/csv|xlsx/)
    const record = await uploadTable(options, {
      filename: 'a.csv',
      bytes: Buffer.from('a,b\n1,2\n', 'utf8'),
    })
    await addKnowledgeEntry(options.dshHome, record.id, { key: 'GMV', value: '销售额' })
    await removeSource(options, record.id)
    const listed = await listSourceViews(options, 's')
    expect(listed.sources.some(source => source.id === record.id)).toBe(false)
    expect((await loadKnowledge(options.dshHome, record.id)).entries).toEqual([])
  })

  it('always lists built-in sqlite and xlsx demos and refuses to delete them', async () => {
    const options = await tempOptions()
    const listed = await listSourceViews(options, 's')
    expect(listed.sources.some(source => source.id === 'demo-sqlite' && source.origin === 'database')).toBe(true)
    expect(listed.sources.some(source => source.id === 'demo-xlsx' && source.origin === 'upload')).toBe(true)
    await expect(removeSource(options, 'demo-sqlite')).rejects.toThrow(/不能删除/)
    await expect(removeSource(options, 'demo-xlsx')).rejects.toThrow(/不能删除/)
  })
})
