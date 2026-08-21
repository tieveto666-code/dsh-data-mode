import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectSource } from '../src/source-runtime.ts'
import { connectDatabase } from '../src/catalog/store.ts'
import { assertSqliteFile, listSqliteTables } from '../src/sqlite-runtime.ts'

describe('sqlite runtime', () => {
  it('lists tables on the built-in demo', async () => {
    const options = {
      dshHome: await mkdtemp(join(tmpdir(), 'dsh-ds-home-')),
      workspaceRoot: await mkdtemp(join(tmpdir(), 'dsh-ds-ws-')),
    }
    const inspected = await inspectSource(options, 'demo-sqlite')
    expect(listSqliteTables(join(options.dshHome, 'data-mode', 'demo.sqlite'))).toEqual(['orders'])
    expect(inspected.preview?.rowCount).toBe(5)
  })

  it('fails fast when a connected sqlite path does not exist', async () => {
    const options = {
      dshHome: await mkdtemp(join(tmpdir(), 'dsh-ds-home-')),
      workspaceRoot: await mkdtemp(join(tmpdir(), 'dsh-ds-ws-')),
    }
    const missing = join(options.workspaceRoot, 'no-such.sqlite')
    const record = await connectDatabase(options, {
      engine: 'sqlite',
      label: 'missing',
      sqlitePath: missing,
    })
    await expect(assertSqliteFile(missing)).rejects.toThrow(/找不到 SQLite 文件/)
    await expect(inspectSource(options, record.id)).rejects.toThrow(/找不到 SQLite 文件/)
  })
})
