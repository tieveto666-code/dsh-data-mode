import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/catalog/load-catalog.ts'
import { IMPLICIT_SOURCE_ID } from '../src/paths.ts'

describe('loadCatalog', () => {
  it('falls back to the SQLite/XLSX demos and workspace csv/parquet when no catalog files exist', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-cat-home-'))
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-cat-ws-'))
    const catalog = await loadCatalog({ dshHome, workspaceRoot })
    expect(catalog.sources.map(source => source.id)).toEqual(['demo-sqlite', 'demo-xlsx'])
    expect(catalog.sources[0]?.type).toBe('sqlite')
    expect(catalog.sources[1]?.type).toBe('duckdb-files')
    expect(catalog.sources[1]?.files?.[0]).toMatch(/demo\.xlsx$/)
    expect(catalog.sources.some(source => source.id === IMPLICIT_SOURCE_ID)).toBe(false)
    await access(join(dshHome, 'data-mode', 'demo.sqlite'))
    await access(join(dshHome, 'data-mode', 'demo.xlsx'))
  })

  it('strips a persisted workspace-files scan source', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-cat-home-'))
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-cat-ws-'))
    await mkdir(join(workspaceRoot, '.dsh', 'data-mode'), { recursive: true })
    await writeFile(
      join(workspaceRoot, '.dsh', 'data-mode', 'catalog.yaml'),
      `sources:\n  - id: workspace-files\n    type: duckdb-files\n    label: 工作区 CSV / XLSX\n    origin: workspace\n    workspaceGlobs: ["**/*.csv"]\n    readonly: true\n`,
      'utf8',
    )
    const catalog = await loadCatalog({ dshHome, workspaceRoot })
    expect(catalog.sources.map(source => source.id)).toEqual(['demo-sqlite', 'demo-xlsx'])
  })

  it('reads home catalog and lets workspace override the same id', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-cat-home-'))
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dsh-cat-ws-'))
    await mkdir(join(dshHome, 'data-mode'), { recursive: true })
    await mkdir(join(workspaceRoot, '.dsh', 'data-mode'), { recursive: true })
    await writeFile(
      join(dshHome, 'data-mode', 'catalog.yaml'),
      `sources:\n  - id: sales\n    type: duckdb-files\n    label: Home sales\n    workspaceGlobs: ["sales.csv"]\n    readonly: true\n`,
      'utf8',
    )
    await writeFile(
      join(workspaceRoot, '.dsh', 'data-mode', 'catalog.yaml'),
      `sources:\n  - id: sales\n    type: duckdb-files\n    label: Workspace sales\n    workspaceGlobs: ["data/sales.csv"]\n    readonly: true\n`,
      'utf8',
    )
    const catalog = await loadCatalog({ dshHome, workspaceRoot })
    expect(catalog.sources.map(source => source.id)).toEqual(['demo-sqlite', 'demo-xlsx', 'sales'])
    expect(catalog.sources[2]?.label).toBe('Workspace sales')
    expect(catalog.sources[2]?.workspaceGlobs).toEqual(['data/sales.csv'])
  })
})
