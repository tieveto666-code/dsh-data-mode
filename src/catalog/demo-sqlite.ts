import { access, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_MODE_DIR } from '../paths.ts'
import type { DataSourceRecord } from './types.ts'

export const DEMO_SQLITE_ID = 'demo-sqlite'
export const DEMO_SQLITE_LABEL = 'SQLite 示例'

export function demoSqlitePath(dshHome: string): string {
  return join(dshHome, DATA_MODE_DIR, 'demo.sqlite')
}

export function demoSqliteSource(dshHome: string): DataSourceRecord {
  return {
    id: DEMO_SQLITE_ID,
    type: 'sqlite',
    label: DEMO_SQLITE_LABEL,
    origin: 'database',
    sqlitePath: demoSqlitePath(dshHome),
    readonly: true,
  }
}

function packagedDemoPath(): string {
  return fileURLToPath(new URL('../../examples/demo.sqlite', import.meta.url))
}

export async function ensureDemoSqlite(dshHome: string): Promise<string> {
  const dest = demoSqlitePath(dshHome)
  try {
    await access(dest)
    return dest
  } catch {
    await mkdir(join(dshHome, DATA_MODE_DIR), { recursive: true })
    await copyFile(packagedDemoPath(), dest)
    return dest
  }
}

export function withDemoSource(sources: DataSourceRecord[], dshHome: string): DataSourceRecord[] {
  if (sources.some(source => source.id === DEMO_SQLITE_ID)) return sources
  return [demoSqliteSource(dshHome), ...sources]
}
