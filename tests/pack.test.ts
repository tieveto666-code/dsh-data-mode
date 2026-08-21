import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('release pack surface', () => {
  it('ships lib entries, LICENSE, examples, and the registrar-only host patch', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      files: string[]
      exports: Record<string, string>
      dsh?: { client?: { platform?: string } }
    }
    expect(pkg.files).toEqual(expect.arrayContaining(['lib', 'LICENSE', 'examples', 'preset', 'cordis.patch.yml']))
    expect(pkg.exports['./catalog-reader']).toBe('./lib/catalog-reader.mjs')
    expect(pkg.exports['./client']).toBe('./lib/client.js')
    expect(pkg.dsh?.client?.platform).toBe('web')
    expect(pkg.dsh?.client?.platform).toBe('web')
    expect(pkg.exports['./provider-duckdb']).toBe('./lib/provider-duckdb.mjs')
    expect(existsSync(join(root, 'LICENSE'))).toBe(true)
    expect(existsSync(join(root, 'lib/index.mjs'))).toBe(true)
    expect(existsSync(join(root, 'lib/provider-duckdb.mjs'))).toBe(true)
    expect(existsSync(join(root, 'lib/catalog-reader.mjs'))).toBe(true)
    expect(existsSync(join(root, 'lib/client.js'))).toBe(true)
    expect(existsSync(join(root, 'examples/catalog.yaml'))).toBe(true)
    expect(readFileSync(join(root, 'cordis.patch.yml'), 'utf8')).not.toContain('run_sql')
  })
})
