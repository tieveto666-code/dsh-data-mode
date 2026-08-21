import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findWorkspaceFiles } from '../src/workspace-files.ts'

describe('findWorkspaceFiles', () => {
  it('finds csv files and skips node_modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-ws-'))
    await writeFile(join(root, 'sales.csv'), 'a,b\n1,2\n', 'utf8')
    await writeFile(join(root, 'book.xlsx'), 'not-a-real-xlsx', 'utf8')
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'skip.csv'), 'a,b\n3,4\n', 'utf8')
    const files = await findWorkspaceFiles(root, ['**/*.csv', '**/*.xlsx'], 80)
    expect(files.map(file => file.relPath).sort()).toEqual(['book.xlsx', 'sales.csv'])
  })
})
